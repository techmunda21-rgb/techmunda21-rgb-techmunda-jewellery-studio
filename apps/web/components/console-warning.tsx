'use client';
import { useEffect } from 'react';

/** Self-XSS warning shown in DevTools. It does not hide anything (nothing secret is ever sent to the browser); it protects users from being tricked into pasting attacker code. */
export function ConsoleWarning() {
  useEffect(() => {
    if ((window as unknown as { __tmWarned?: boolean }).__tmWarned) return;
    (window as unknown as { __tmWarned?: boolean }).__tmWarned = true;
    console.log('%cStop!', 'color:#780514;font-size:42px;font-weight:700;font-family:Georgia,serif');
    console.log('%cThis browser console is for developers. If someone asked you to paste something here to “unlock” a feature or “see” an account, it is a scam that gives them access to your account. Report suspicious activity to techmunda21@gmail.com.', 'font-size:14px;line-height:1.5');
  }, []);
  return null;
}
