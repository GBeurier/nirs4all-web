/**
 * ScatterWebGL3D — dependency-free WebGL2 3D scatter plot.
 *
 * Draws coloured 3D points with an orbit camera (drag to rotate, wheel to zoom).
 * Points are normalized into a centered [-1,1]^3 cube by max-abs range. No GPU
 * picking, selection, hover, legends, or third-party deps — just the point cloud.
 * Ported and trimmed from the studio renderer.
 */

import { useEffect, useMemo, useRef } from 'react'
import { cssToRGBA } from './colorEncoding'
import { mat4Identity, mat4Perspective } from './projectionMatrix'
import { OrbitControls } from './orbitControls'

interface ScatterWebGL3DProps {
  /** PC scores, one [x,y,z] per sample. */
  points: [number, number, number][]
  /** CSS color per point (may be `var(--chart-*)` or `hsl(...)`). */
  colors: string[]
  /** Optional axis tip labels [x, y, z]. */
  axisLabels?: [string, string, string]
  /** Canvas height in px (default 320). */
  height?: number
  /** Point size in px (default 6). */
  pointSize?: number
}

const VERTEX_SHADER = `#version 300 es
precision highp float;
uniform mat4 u_projection;
uniform mat4 u_view;
uniform mat4 u_model;
uniform float u_pointSize;
uniform float u_dpr;
in vec3 a_position;
in vec4 a_color;
out vec4 v_color;
void main() {
  vec4 viewPos = u_view * u_model * vec4(a_position, 1.0);
  gl_Position = u_projection * viewPos;
  float depthScale = 4.0 / max(-viewPos.z, 0.1);
  gl_PointSize = u_pointSize * u_dpr * depthScale;
  v_color = a_color;
}
`

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 fragColor;
void main() {
  vec2 coord = gl_PointCoord - 0.5;
  float dist = length(coord);
  if (dist > 0.5) discard;
  float shade = 0.65 + 0.35 * (1.0 - dist * 2.0);
  float alpha = 1.0 - smoothstep(0.42, 0.5, dist);
  fragColor = vec4(v_color.rgb * shade, v_color.a * alpha);
}
`

function createShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (!shader) throw new Error('Failed to create shader')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`Shader compile error: ${info ?? 'unknown'}`)
  }
  return shader
}

function createProgram(gl: WebGL2RenderingContext): WebGLProgram {
  const vs = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER)
  const fs = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER)
  const program = gl.createProgram()
  if (!program) throw new Error('Failed to create program')
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program)
    throw new Error(`Program link error: ${info ?? 'unknown'}`)
  }
  return program
}

/** Pack points into a centered [-1,1]^3 cube by max-abs range about the centroid. */
function buildPositions(points: [number, number, number][]): Float32Array {
  const n = points.length
  const out = new Float32Array(n * 3)
  if (n === 0) return out

  const min: [number, number, number] = [Infinity, Infinity, Infinity]
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const p of points) {
    for (let a = 0; a < 3; a++) {
      const v = p[a]
      if (Number.isFinite(v)) {
        if (v < min[a]) min[a] = v
        if (v > max[a]) max[a] = v
      }
    }
  }
  const center: [number, number, number] = [0, 0, 0]
  let maxRange = 0
  for (let a = 0; a < 3; a++) {
    if (!Number.isFinite(min[a]) || !Number.isFinite(max[a])) { min[a] = -1; max[a] = 1 }
    center[a] = (min[a] + max[a]) / 2
    maxRange = Math.max(maxRange, max[a] - min[a])
  }
  const scale = maxRange > 0 ? 2 / maxRange : 1

  for (let i = 0; i < n; i++) {
    for (let a = 0; a < 3; a++) {
      const v = points[i][a]
      out[i * 3 + a] = Number.isFinite(v) ? (v - center[a]) * scale : 0
    }
  }
  return out
}

function buildColors(colors: string[], n: number): Float32Array {
  const out = new Float32Array(n * 4)
  for (let i = 0; i < n; i++) {
    const [r, g, b, a] = cssToRGBA(colors[i] ?? 'var(--chart-1)')
    out[i * 4] = r
    out[i * 4 + 1] = g
    out[i * 4 + 2] = b
    out[i * 4 + 3] = a
  }
  return out
}

export default function ScatterWebGL3D({
  points,
  colors,
  axisLabels,
  height = 320,
  pointSize = 6,
}: ScatterWebGL3DProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fallbackRef = useRef<HTMLDivElement>(null)

  const positions = useMemo(() => buildPositions(points), [points])
  const colorData = useMemo(() => buildColors(colors, points.length), [colors, points.length])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      depth: true,
    })
    if (!gl) {
      if (fallbackRef.current) fallbackRef.current.style.display = 'flex'
      canvas.style.display = 'none'
      return
    }

    let program: WebGLProgram
    try {
      program = createProgram(gl)
    } catch {
      if (fallbackRef.current) fallbackRef.current.style.display = 'flex'
      canvas.style.display = 'none'
      return
    }

    const aPosition = gl.getAttribLocation(program, 'a_position')
    const aColor = gl.getAttribLocation(program, 'a_color')
    const uProjection = gl.getUniformLocation(program, 'u_projection')
    const uView = gl.getUniformLocation(program, 'u_view')
    const uModel = gl.getUniformLocation(program, 'u_model')
    const uPointSize = gl.getUniformLocation(program, 'u_pointSize')
    const uDpr = gl.getUniformLocation(program, 'u_dpr')

    const vao = gl.createVertexArray()
    const positionBuffer = gl.createBuffer()
    const colorBuffer = gl.createBuffer()
    if (!vao || !positionBuffer || !colorBuffer) return

    gl.bindVertexArray(vao)

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(aPosition)
    gl.vertexAttribPointer(aPosition, 3, gl.FLOAT, false, 0, 0)

    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, colorData, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(aColor)
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, 0, 0)

    gl.bindVertexArray(null)

    const modelMatrix = mat4Identity()
    const n = positions.length / 3

    let dirty = true
    const orbit = new OrbitControls(canvas, {
      initialDistance: 4.5,
      initialTheta: Math.PI / 4,
      initialPhi: Math.PI / 2.6,
      onChange: () => { dirty = true },
    })

    let raf = 0
    let running = true

    const render = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const w = Math.max(1, Math.floor(container.clientWidth * dpr))
      const h = Math.max(1, Math.floor(container.clientHeight * dpr))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        dirty = true
      }
      if (!dirty) return
      dirty = false

      gl.viewport(0, 0, w, h)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      gl.enable(gl.DEPTH_TEST)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)

      if (n > 0) {
        const projection = mat4Perspective(Math.PI / 4, w / h, 0.1, 100)
        const view = orbit.getViewMatrix()
        gl.useProgram(program)
        gl.uniformMatrix4fv(uProjection, false, projection)
        gl.uniformMatrix4fv(uView, false, view)
        gl.uniformMatrix4fv(uModel, false, modelMatrix)
        gl.uniform1f(uPointSize, pointSize)
        gl.uniform1f(uDpr, dpr)
        gl.bindVertexArray(vao)
        gl.drawArrays(gl.POINTS, 0, n)
        gl.bindVertexArray(null)
      }

      gl.disable(gl.BLEND)
      gl.disable(gl.DEPTH_TEST)
    }

    const loop = () => {
      if (!running) return
      render()
      raf = requestAnimationFrame(loop)
    }
    loop()

    const resizeObserver = new ResizeObserver(() => { dirty = true })
    resizeObserver.observe(container)

    return () => {
      running = false
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      orbit.dispose()
      gl.deleteBuffer(positionBuffer)
      gl.deleteBuffer(colorBuffer)
      gl.deleteVertexArray(vao)
      gl.deleteProgram(program)
    }
  }, [positions, colorData, pointSize])

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', height: `${height}px` }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
      />
      <div
        ref={fallbackRef}
        style={{
          display: 'none',
          position: 'absolute',
          inset: 0,
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 1rem',
          textAlign: 'center',
          fontSize: '0.8125rem',
          color: 'var(--muted-foreground)',
        }}
      >
        WebGL2 not available — use the 2D view.
      </div>
      {axisLabels && (
        <div
          style={{
            position: 'absolute',
            bottom: 4,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            gap: '0.75rem',
            fontSize: '0.6875rem',
            color: 'var(--muted-foreground)',
            pointerEvents: 'none',
          }}
        >
          <span>X: {axisLabels[0]}</span>
          <span>Y: {axisLabels[1]}</span>
          <span>Z: {axisLabels[2]}</span>
        </div>
      )}
    </div>
  )
}

export type { ScatterWebGL3DProps }
