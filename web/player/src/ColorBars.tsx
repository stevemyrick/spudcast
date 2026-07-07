/** SMPTE-style color bars for the dead-channel / standby slate. Pure CSS. */
export function ColorBars({ label }: { label?: string }) {
  return (
    <div className="color-bars" aria-hidden>
      <div className="cb-main">
        <span style={{ background: "#c0c0c0" }} />
        <span style={{ background: "#c0c000" }} />
        <span style={{ background: "#00c0c0" }} />
        <span style={{ background: "#00c000" }} />
        <span style={{ background: "#c000c0" }} />
        <span style={{ background: "#c00000" }} />
        <span style={{ background: "#0000c0" }} />
      </div>
      <div className="cb-lower" />
      {label && <div className="cb-label">{label}</div>}
    </div>
  );
}
