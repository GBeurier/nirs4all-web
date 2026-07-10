/**
 * Orbit camera for the 3D scatter: left-drag (or single-touch) rotates,
 * wheel (or pinch) zooms. Trimmed copy of the studio orbit controls — pan,
 * selection-button reservation, and damping are dropped. Pure TS, no deps.
 */

import { mat4LookAt } from './projectionMatrix'

export interface OrbitState {
  /** Azimuthal angle (radians). */
  theta: number
  /** Polar angle (radians). */
  phi: number
  /** Distance from target. */
  distance: number
}

export interface OrbitControlsOptions {
  initialTheta?: number
  initialPhi?: number
  initialDistance?: number
  minDistance?: number
  maxDistance?: number
  minPhi?: number
  maxPhi?: number
  rotateSpeed?: number
  zoomSpeed?: number
  /** Called whenever the camera state changes (request a redraw). */
  onChange?: () => void
}

const DEFAULT_OPTIONS: Required<OrbitControlsOptions> = {
  initialTheta: Math.PI / 4,
  initialPhi: Math.PI / 3,
  initialDistance: 4,
  minDistance: 1.2,
  maxDistance: 20,
  minPhi: 0.1,
  maxPhi: Math.PI - 0.1,
  rotateSpeed: 0.005,
  zoomSpeed: 0.001,
  onChange: () => {},
}

export class OrbitControls {
  private readonly canvas: HTMLCanvasElement
  private readonly options: Required<OrbitControlsOptions>
  private readonly state: OrbitState

  private dragging = false
  private lastX = 0
  private lastY = 0
  private lastPinchDist = 0

  private readonly onMouseDown: (e: MouseEvent) => void
  private readonly onMouseMove: (e: MouseEvent) => void
  private readonly onMouseUp: () => void
  private readonly onWheel: (e: WheelEvent) => void
  private readonly onTouchStart: (e: TouchEvent) => void
  private readonly onTouchMove: (e: TouchEvent) => void
  private readonly onTouchEnd: (e: TouchEvent) => void

  constructor(canvas: HTMLCanvasElement, options: OrbitControlsOptions = {}) {
    this.canvas = canvas
    this.options = { ...DEFAULT_OPTIONS, ...options }
    this.state = {
      theta: this.options.initialTheta,
      phi: this.options.initialPhi,
      distance: this.options.initialDistance,
    }

    this.onMouseDown = (e) => {
      this.dragging = true
      this.lastX = e.clientX
      this.lastY = e.clientY
    }
    this.onMouseMove = (e) => {
      if (!this.dragging) return
      this.rotate(e.clientX - this.lastX, e.clientY - this.lastY)
      this.lastX = e.clientX
      this.lastY = e.clientY
    }
    this.onMouseUp = () => {
      this.dragging = false
    }
    this.onWheel = (e) => {
      e.preventDefault()
      this.zoom(e.deltaY * this.options.zoomSpeed)
    }
    this.onTouchStart = (e) => {
      if (e.touches.length === 1) {
        e.preventDefault()
        this.dragging = true
        this.lastX = e.touches[0].clientX
        this.lastY = e.touches[0].clientY
      } else if (e.touches.length === 2) {
        e.preventDefault()
        this.dragging = false
        this.lastPinchDist = this.touchDistance(e)
      }
    }
    this.onTouchMove = (e) => {
      if (e.touches.length === 1 && this.dragging) {
        e.preventDefault()
        this.rotate(e.touches[0].clientX - this.lastX, e.touches[0].clientY - this.lastY)
        this.lastX = e.touches[0].clientX
        this.lastY = e.touches[0].clientY
      } else if (e.touches.length === 2) {
        e.preventDefault()
        const dist = this.touchDistance(e)
        if (this.lastPinchDist > 0) {
          this.zoom((this.lastPinchDist - dist) * 0.01)
        }
        this.lastPinchDist = dist
      }
    }
    this.onTouchEnd = (e) => {
      if (e.touches.length === 0) {
        this.dragging = false
        this.lastPinchDist = 0
      }
    }

    canvas.addEventListener('mousedown', this.onMouseDown)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false })
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false })
    canvas.addEventListener('touchend', this.onTouchEnd)
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('mouseup', this.onMouseUp)
  }

  private touchDistance(e: TouchEvent): number {
    const dx = e.touches[0].clientX - e.touches[1].clientX
    const dy = e.touches[0].clientY - e.touches[1].clientY
    return Math.sqrt(dx * dx + dy * dy)
  }

  private rotate(dx: number, dy: number): void {
    this.state.theta -= dx * this.options.rotateSpeed
    this.state.phi = Math.max(
      this.options.minPhi,
      Math.min(this.options.maxPhi, this.state.phi - dy * this.options.rotateSpeed),
    )
    this.options.onChange()
  }

  private zoom(delta: number): void {
    this.state.distance = Math.max(
      this.options.minDistance,
      Math.min(this.options.maxDistance, this.state.distance * (1 + delta)),
    )
    this.options.onChange()
  }

  /** Camera eye position in world space (spherical → Cartesian around origin). */
  getEyePosition(): [number, number, number] {
    const { theta, phi, distance } = this.state
    const sinPhi = Math.sin(phi)
    return [
      distance * sinPhi * Math.cos(theta),
      distance * Math.cos(phi),
      distance * sinPhi * Math.sin(theta),
    ]
  }

  /** Current view matrix looking at the origin. */
  getViewMatrix(): Float32Array {
    return mat4LookAt(this.getEyePosition(), [0, 0, 0], [0, 1, 0])
  }

  /** Restore the initial camera state. */
  reset(): void {
    this.state.theta = this.options.initialTheta
    this.state.phi = this.options.initialPhi
    this.state.distance = this.options.initialDistance
    this.options.onChange()
  }

  /** Remove all event listeners. */
  dispose(): void {
    this.canvas.removeEventListener('mousedown', this.onMouseDown)
    this.canvas.removeEventListener('wheel', this.onWheel)
    this.canvas.removeEventListener('touchstart', this.onTouchStart)
    this.canvas.removeEventListener('touchmove', this.onTouchMove)
    this.canvas.removeEventListener('touchend', this.onTouchEnd)
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mouseup', this.onMouseUp)
  }
}
