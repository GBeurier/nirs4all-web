import { useEffect, useState } from 'react'
import { CheckCircle2, Database, Settings2, XCircle } from 'lucide-react'
import type { TaskType } from '@/engine/types'
import type { DatasetConfigDialogProps } from '@/components/contracts'
import { validateSpec } from '@/data/wasm-io'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/app/components/ui/dialog'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Slider } from '@/app/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/ui/select'
import { hasTestPartition } from './_helpers'

const TASK_OPTIONS: { value: TaskType; label: string }[] = [
  { value: 'regression', label: 'Regression' },
  { value: 'binary', label: 'Binary classification' },
  { value: 'multiclass', label: 'Multiclass classification' },
]

/**
 * Controlled dataset config dialog. Edits target name, task type, and (only
 * when there is no test split) the train/test fraction. Emits a patch on Apply;
 * the host applies it to the dataset — this component never mutates ds.
 */
export function DatasetConfigDialog({ open, ds, analysis, onOpenChange, onApply }: DatasetConfigDialogProps) {
  const needsSplit = !hasTestPartition(ds)
  const [targetName, setTargetName] = useState(ds.targetName)
  const [taskType, setTaskType] = useState<TaskType>(ds.taskType)
  const [testFraction, setTestFraction] = useState(0.2)
  const [specValid, setSpecValid] = useState<{ ok: boolean; error?: string } | null>(null)

  const plan = analysis?.plan ?? null

  // Re-sync local state whenever the dialog (re)opens or the dataset changes.
  useEffect(() => {
    if (open) {
      setTargetName(ds.targetName)
      setTaskType(ds.taskType)
      setTestFraction(0.2)
    }
  }, [open, ds])

  // Validate the inferred DatasetSpec against the nirs4all-io schema (WASM path only).
  useEffect(() => {
    let live = true
    if (open && plan?.resolved_spec) {
      validateSpec(plan.resolved_spec).then((r) => live && setSpecValid(r))
    } else {
      setSpecValid(null)
    }
    return () => {
      live = false
    }
  }, [open, plan])

  const apply = () => {
    onApply({
      targetName: targetName.trim() || ds.targetName,
      taskType,
      ...(needsSplit ? { testFraction } : {}),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-brand-teal">
              <Settings2 className="h-4 w-4" />
            </span>
            Configure dataset
          </DialogTitle>
          <DialogDescription>
            Tune how the target is interpreted before building a pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="space-y-2">
            <Label htmlFor="config-target">Target name</Label>
            <Input
              id="config-target"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              placeholder="e.g. protein"
            />
            <p className="text-xs text-muted-foreground">
              The reference property being modelled.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="config-task">Task type</Label>
            <Select value={taskType} onValueChange={(v) => setTaskType(v as TaskType)}>
              <SelectTrigger id="config-task" className="w-full">
                <SelectValue placeholder="Select a task" />
              </SelectTrigger>
              <SelectContent>
                {TASK_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Regression predicts a continuous value; classification predicts a class.
            </p>
          </div>

          {needsSplit && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="config-split">Test fraction</Label>
                <span className="font-mono text-sm font-semibold text-brand-teal">
                  {(testFraction * 100).toFixed(0)}%
                </span>
              </div>
              <Slider
                id="config-split"
                min={0}
                max={0.5}
                step={0.05}
                value={[testFraction]}
                onValueChange={([v]) => setTestFraction(v)}
              />
              <p className="text-xs text-muted-foreground">
                No test partition was detected — hold out this fraction of samples for evaluation.
              </p>
            </div>
          )}

          {plan && (
            <div className="space-y-3 rounded-xl border border-border bg-brand-paper/50 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Database className="h-4 w-4 text-brand-cyan" />
                nirs4all-io inference
                {analysis?.readers?.count ? (
                  <span className="ml-auto rounded-full bg-card px-2 py-0.5 text-xs font-normal text-muted-foreground">
                    {analysis.readers.count} readers
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {([
                  ['Structure', plan.structure],
                  ['Signal', plan.signal_type],
                  ['Task', plan.task_type],
                ] as const).map(([label, d]) =>
                  d?.value ? (
                    <div key={label} className="rounded-lg bg-card px-3 py-2">
                      <div className="text-muted-foreground">{label}</div>
                      <div className="font-mono text-foreground">
                        {d.value}
                        {typeof d.score === 'number' && (
                          <span className="text-muted-foreground"> · {(d.score * 100).toFixed(0)}%</span>
                        )}
                      </div>
                    </div>
                  ) : null,
                )}
                {plan.axis?.n ? (
                  <div className="rounded-lg bg-card px-3 py-2">
                    <div className="text-muted-foreground">Axis</div>
                    <div className="font-mono text-foreground">
                      {plan.axis.n} pts {plan.axis.unit ? `(${plan.axis.unit})` : ''}
                    </div>
                  </div>
                ) : null}
              </div>
              {specValid && (
                <div
                  className={`flex items-center gap-2 text-xs ${specValid.ok ? 'text-brand-green' : 'text-destructive'}`}
                >
                  {specValid.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {specValid.ok ? 'DatasetSpec valid against the nirs4all-io schema' : `Spec invalid: ${specValid.error}`}
                </div>
              )}
              {plan.warnings && plan.warnings.length > 0 && (
                <ul className="list-inside list-disc space-y-0.5 text-xs text-brand-amber">
                  {plan.warnings.slice(0, 4).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}
              {plan.recommendations && plan.recommendations.length > 0 && (
                <ul className="list-inside list-disc space-y-0.5 text-xs text-muted-foreground">
                  {plan.recommendations.slice(0, 3).map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={apply}>Apply</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
