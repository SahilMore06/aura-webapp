/**
 * AURA — OTPInput Component
 * Six individual input boxes with smart UX:
 * - Auto-advance on digit entry
 * - Backspace goes to previous box
 * - Paste works (e.g. paste "482193" fills all boxes)
 * - Mobile number keyboard
 */
import React, { useRef, useState, useEffect, KeyboardEvent, ClipboardEvent } from 'react';

interface OTPInputProps {
  length?: number;
  onChange: (otp: string) => void;
  disabled?: boolean;
  error?: boolean;
  autoFocus?: boolean;
}

export function OTPInput({
  length = 6,
  onChange,
  disabled = false,
  error = false,
  autoFocus = true,
}: OTPInputProps) {
  const [values, setValues] = useState<string[]>(Array(length).fill(''));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (autoFocus) inputs.current[0]?.focus();
  }, [autoFocus]);

  const notify = (vals: string[]) => onChange(vals.join(''));

  const handleChange = (index: number, value: string) => {
    // Only allow single digit
    const digit = value.replace(/\D/g, '').slice(-1);
    const next = [...values];
    next[index] = digit;
    setValues(next);
    notify(next);

    // Auto-advance to next box
    if (digit && index < length - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (values[index]) {
        // Clear current box
        const next = [...values];
        next[index] = '';
        setValues(next);
        notify(next);
      } else if (index > 0) {
        // Move to previous box and clear it
        const next = [...values];
        next[index - 1] = '';
        setValues(next);
        notify(next);
        inputs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      inputs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      inputs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    const next = Array(length).fill('');
    pasted.split('').forEach((d, i) => { next[i] = d; });
    setValues(next);
    notify(next);
    // Focus the box after the last filled position
    const focusIdx = Math.min(pasted.length, length - 1);
    inputs.current[focusIdx]?.focus();
  };

  return (
    <div className="flex items-center justify-center gap-3" role="group" aria-label="Enter OTP">
      {values.map((val, i) => (
        <input
          key={i}
          ref={(el) => { inputs.current[i] = el; }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={val}
          disabled={disabled}
          aria-label={`OTP digit ${i + 1}`}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
          className={[
            'w-12 h-14 text-center text-xl font-bold rounded-xl border-2 outline-none transition-all duration-200',
            'bg-bg text-text-primary caret-transparent',
            disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-text',
            error
              ? 'border-red-500 bg-red-500/5 shake'
              : val
                ? 'border-[#00D4AA] bg-[#00D4AA]/5 shadow-[0_0_12px_rgba(0,212,170,0.2)]'
                : 'border-stroke hover:border-muted focus:border-[#00D4AA]',
          ].join(' ')}
        />
      ))}
    </div>
  );
}
