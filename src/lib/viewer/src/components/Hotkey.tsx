import './Hotkey.css';

interface HotkeyProps {
  keys: string[];
  description?: string;
}

export default function Hotkey({ keys, description }: HotkeyProps) {
  return (
    <span className="hotkey-wrapper">
      {description && <span className="hotkey-description">{description}</span>}
      {keys.map((key, index) => (
        <kbd key={index} className="hotkey-key">
          {key}
        </kbd>
      ))}
    </span>
  );
}
