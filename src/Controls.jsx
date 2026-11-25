import { useLanguage } from './Language.jsx';
import { useEffect, useRef } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

const classes = (...names) => names.filter(Boolean).join(' ');

export function Button({ variant = 'secondary', className, type = 'button', ...props }) {
  return <button type={type} className={classes(
    variant === 'text' ? 'text-button' : variant !== 'plain' && 'button ' + variant,
    className,
  )} {...props} />;
}

export function IconButton({ variant, compact = false, className, ...props }) {
  return <button type="button" className={classes('icon-button', variant, compact && 'compact-control', className)} {...props} />;
}

export function TextInput({ className, ...props }) {
  return <input className={classes('input', className)} {...props} />;
}

export function Checkbox(props) {
  return <input {...props} type="checkbox" className="checkbox-control" />;
}

export function Radio({ className, ...props }) {
  return <input {...props} type="radio" className={classes('radio-control', className)} />;
}

export function Select({ className, ...props }) {
  return <div className={classes('select-field', className)}>
    <select className="input select" {...props} />
    <ChevronDown className="select-chevron" size={15} aria-hidden="true" />
  </div>;
}

export function SearchField({ className, onClear, shortcut, ...props }) {
  const { t } = useLanguage();
  return <div className={classes('search', className)}>
    <Search size={16} aria-hidden="true" />
    <input {...props} />
    {props.value && onClear ? <IconButton compact aria-label={t("清除搜索")} onClick={onClear}><X size={15} /></IconButton> :
      shortcut && !props.value ? <kbd>{shortcut}</kbd> : null}
  </div>;
}

export function Dialog({ children, title, onClose, busy = false, className }) {
  const { t } = useLanguage();
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);

  return <dialog ref={ref} className={classes('modal', className)} aria-label={title} onCancel={(event) => {
    event.preventDefault();
    if (!busy) onClose();
  }}>
    <div className="modal-top">
      <h2>{title}</h2>
      <IconButton aria-label={t("关闭")} onClick={onClose} disabled={busy}><X size={19} /></IconButton>
    </div>
    {children}
  </dialog>;
}
