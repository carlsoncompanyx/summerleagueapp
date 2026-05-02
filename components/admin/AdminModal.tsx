'use client';

export default function AdminModal({ title, open, onClose, children, footer }: any) {
  if (!open) return null;
  return <div className='admin-modal-backdrop' role='dialog' aria-modal='true'><div className='admin-modal'><div className='admin-modal-header'><h3>{title}</h3><button onClick={onClose}>✕</button></div><div className='admin-modal-body'>{children}</div>{footer && <div className='admin-modal-footer'>{footer}</div>}</div></div>;
}
