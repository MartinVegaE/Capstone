import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastMsg = { id: number; text: string };

const ToastCtx = createContext<{ show: (text: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<ToastMsg[]>([]);

  const show = useCallback((text: string) => {
    const id = Date.now() + Math.random();
    setList((prev) => [...prev, { id, text }]);
    setTimeout(() => {
      setList((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <div style={{ position: 'fixed', bottom: 16, right: 16, display: 'grid', gap: 8, zIndex: 10000 }}>
        {list.map((t) => (
          <div
            key={t.id}
            style={{
              background: '#333', color: '#fff', padding: '8px 12px',
              borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,.2)'
            }}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.show;
}
