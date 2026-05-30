import './Hotkey.css';

interface HotkeyProps {
  keys: string[];
  description?: string;
  /** 内嵌模式：不包裹 hotkey-wrapper，直接渲染 <kbd>，适用于嵌入段落文本 */
  inline?: boolean;
}

export default function Hotkey({ keys, description, inline }: HotkeyProps) {
  const kbdElements = keys.map((key, index) => (
    <kbd key={index} className="hotkey-key">
      {key}
    </kbd>
  ));

  if (inline) {
    return <>{kbdElements}</>;
  }

  return (
    <span className="hotkey-wrapper">
      {description && <span className="hotkey-description">{description}</span>}
      {kbdElements}
    </span>
  );
}
