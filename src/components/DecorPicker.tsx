// The mirror's panel: swap the 3D flat's furniture. Choices are shared with the whole house.
import type { Decor, DecorSlot } from "../hooks/useHouseholdData";
import { DECOR_ORDER, DECOR_SLOTS, type DecorSlotInfo } from "./flat/decor";

interface DecorPickerProps {
  decor: Decor;
  onChange: <S extends DecorSlot>(slot: S, style: Decor[S]) => void;
}

function SlotChoices<S extends DecorSlot>({ slot, current, onChange }: {
  slot: S;
  current: Decor[S];
  onChange: DecorPickerProps["onChange"];
}) {
  const info = DECOR_SLOTS[slot] as DecorSlotInfo<S>;
  const styles = Object.keys(info.options) as Decor[S][];
  return (
    <div className="decor-slot" role="group" aria-labelledby={`decor-${slot}`}>
      <p className="decor-slot-name" id={`decor-${slot}`}>
        {info.label} <span>{info.where}</span>
      </p>
      <div className="decor-options">
        {styles.map((style) => (
          <button
            key={style}
            type="button"
            className={`decor-option${style === current ? " active" : ""}`}
            aria-pressed={style === current}
            onClick={() => onChange(slot, style)}
          >
            {info.swatches?.[style] && (
              <span className="decor-swatch" style={{ background: info.swatches[style] }} aria-hidden="true" />
            )}
            {info.options[style]}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function DecorPicker({ decor, onChange }: DecorPickerProps) {
  return (
    <section className="house-panel" aria-labelledby="decor-panel-title">
      <p className="eyebrow"><span>✦</span> MIRROR, MIRROR</p>
      <h2 id="decor-panel-title">Redecorate<span className="heading-period">.</span></h2>
      <p className="decor-intro">Changes show up in everyone’s flat straight away.</p>
      {DECOR_ORDER.map((slot) => (
        <SlotChoices key={slot} slot={slot} current={decor[slot]} onChange={onChange} />
      ))}
    </section>
  );
}
