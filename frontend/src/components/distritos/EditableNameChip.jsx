import React, { useEffect, useMemo, useState } from 'react';

const normalizeName = (value = '') => String(value).replace(/\s+/g, ' ').trim();

export default function EditableNameChip({
  value,
  onSave,
  onDelete,
  onCancel,
  maxLength = 40,
  minWidth = 110,
  compact = false,
  style = {},
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(value || '');
    setError('');
  }, [value]);

  const normalizedValue = useMemo(() => normalizeName(value || ''), [value]);

  const commit = () => {
    const cleaned = normalizeName(draft);

    if (!cleaned) {
      setError('Ingresá un nombre válido');
      return;
    }

    if (cleaned.length > maxLength) {
      setError(`Máximo ${maxLength} caracteres`);
      return;
    }

    if (typeof onSave === 'function') onSave(cleaned);
    setDraft(cleaned);
    setError('');
    setIsEditing(false);
  };

  const cancel = () => {
    setDraft(normalizedValue);
    setError('');
    setIsEditing(false);
    if (typeof onCancel === 'function') onCancel();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commit();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  };

  if (isEditing) {
    return (
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          border: '2px solid #0f4ab4',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.98)',
          padding: '4px 8px 4px 8px',
          boxShadow: '0 2px 10px rgba(15, 23, 42, 0.08)',
          maxWidth: compact ? 150 : 220,
          ...style,
        }}
      >
        <input
          autoFocus
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError('');
          }}
          onBlur={() => commit()}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          style={{
            width: Math.max(minWidth, Math.min(230, (draft.length || 1) * 8 + 18)),
            border: 'none',
            outline: 'none',
            background: 'transparent',
            color: '#173f88',
            fontSize: compact ? 12 : 13,
            fontWeight: 700,
            textAlign: 'center',
            padding: '2px 0',
          }}
        />
        <button
          type="button"
          aria-label="Guardar nombre"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); commit(); }}
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            border: 'none',
            background: '#dbeafe',
            color: '#0f4ab4',
            fontWeight: 800,
            cursor: 'pointer',
            lineHeight: 1,
            padding: 0,
          }}
        >
          ✓
        </button>
        <button
          type="button"
          aria-label="Cancelar edición"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => { e.stopPropagation(); cancel(); }}
          style={{
            width: 18,
            height: 18,
            borderRadius: 999,
            border: 'none',
            background: '#fee2e2',
            color: '#991b1b',
            fontWeight: 800,
            cursor: 'pointer',
            lineHeight: 1,
            padding: 0,
          }}
        >
          ✕
        </button>
        {error ? (
          <span style={{ fontSize: 10, color: '#b91c1c', whiteSpace: 'nowrap' }}>{error}</span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: Math.max(minWidth, String(normalizedValue || 'Sin nombre').length * 7 + 26),
        padding: compact ? '4px 14px' : '6px 16px',
        borderRadius: 999,
        border: '2px solid #0f4ab4',
        background: '#edf6ff',
        color: '#0f4ab4',
        fontSize: compact ? 12 : 13,
        fontWeight: 800,
        textAlign: 'center',
        lineHeight: 1.2,
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)',
        cursor: 'pointer',
        ...style,
      }}
      onClick={(e) => {
        e.stopPropagation();
        setIsEditing(true);
      }}
      title="Editar nombre"
    >
      {normalizedValue || 'Sin nombre'}
      {typeof onDelete === 'function' ? (
        <button
          type="button"
          aria-label="Eliminar"
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          style={{
            marginLeft: 8,
            width: 16,
            height: 16,
            borderRadius: 999,
            border: 'none',
            background: '#fee2e2',
            color: '#991b1b',
            fontSize: 10,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
}
