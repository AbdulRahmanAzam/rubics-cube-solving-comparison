// Name + roll number must stay visible for the whole screen recording.
const NAME = import.meta.env.VITE_STUDENT_NAME || 'Your Name';
const ROLL = import.meta.env.VITE_ROLL_NO || 'Your Roll No';
const MISSING = !import.meta.env.VITE_STUDENT_NAME || !import.meta.env.VITE_ROLL_NO || NAME === 'Your Name';

export default function StudentBadge({ large = false }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-full border px-4 py-1.5 shadow-sm ${
        MISSING ? 'border-lose bg-red-50 text-lose' : 'border-line bg-white text-ink'
      } ${large ? 'text-lg' : 'text-sm'}`}
      title={MISSING ? 'Set VITE_STUDENT_NAME and VITE_ROLL_NO in client/.env' : undefined}
    >
      <span className="font-bold">{NAME}</span>
      <span className="h-4 w-px bg-current opacity-30" />
      <span className="font-mono font-bold tracking-wide">{ROLL}</span>
    </div>
  );
}
