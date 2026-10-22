// Simple generic marks (not brand logos), one per model.
function Spark({ color }) {
  return (
    <svg viewBox="0 0 40 40" className="h-full w-full">
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const r = i % 2 ? 15 : 18;
        return (
          <line
            key={i}
            x1={20 + Math.cos(a) * 4}
            y1={20 + Math.sin(a) * 4}
            x2={20 + Math.cos(a) * r}
            y2={20 + Math.sin(a) * r}
            stroke={color}
            strokeWidth="3.2"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

function Tile({ color, children }) {
  return (
    <div className="grid h-full w-full place-items-center rounded-xl text-white" style={{ background: color }}>
      {children}
    </div>
  );
}

export default function ModelLogo({ model, size = 44 }) {
  const style = { width: size, height: size, fontSize: size };
  let mark;
  switch (model.lane ?? model.id) {
    case 'opus':
      mark = <Spark color={model.color} />;
      break;
    case 'jev':
      mark = (
        <Tile color={model.color}>
          <span className="text-[55%] font-black">J</span>
        </Tile>
      );
      break;
    case 'luna':
      mark = (
        <Tile color={model.color}>
          <svg viewBox="0 0 24 24" className="h-3/5 w-3/5" fill="white">
            <path d="M15.5 3.2A9 9 0 1 0 20.8 15 7 7 0 0 1 15.5 3.2Z" />
          </svg>
        </Tile>
      );
      break;
    case 'planner-only':
    case 'planner-random':
      mark = (
        <Tile color={model.color}>
          <span className="text-[55%] font-black">{model.id === 'planner-only' ? 'P' : '?'}</span>
        </Tile>
      );
      break;
    default:
      mark = (
        <Tile color={model.color}>
          <span className="text-[55%] font-black">C</span>
        </Tile>
      );
  }
  return (
    <div style={style} className="shrink-0">
      {mark}
    </div>
  );
}
