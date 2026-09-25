import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type AllowanceFieldProps = {
  id: string
  label: string
  amount: number | undefined
  notRequired: boolean | undefined
  testId?: string
  onChange: (amount: number, notRequired: boolean) => void
}

/** Old zero-valued drafts remain unconfirmed; only an explicit action waives a fee. */
export function AllowanceField({
  id, label, amount, notRequired, testId, onChange,
}: AllowanceFieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label} ($)</Label>
      <Input
        id={id}
        data-testid={testId}
        type="number"
        min="0"
        step="0.01"
        placeholder="Company default / not set"
        value={notRequired ? 0 : amount || ""}
        aria-describedby={`${id}-help`}
        onChange={(event) => {
          const value = event.target.valueAsNumber
          onChange(Number.isFinite(value) ? value : 0,
            event.target.value !== "" && value === 0)
        }}
      />
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${id}-not-required`}
          checked={notRequired === true}
          onCheckedChange={(checked) => onChange(0, checked === true)}
        />
        <Label htmlFor={`${id}-not-required`} className="text-sm font-normal">
          Not required / $0
          <span className="sr-only"> for {label}</span>
        </Label>
      </div>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {notRequired
          ? "Confirmed no charge for this job. Enter an amount to change."
          : "Blank uses the company price book; without a verified price it stays unresolved."}
      </p>
    </div>
  )
}
