import { useEffect } from 'react';

const KONAMI_SEQUENCE = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
  'KeyB', 'KeyA',
];

function isTypingContext(element) {
  if (!element) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || element.isContentEditable;
}

function useSecretCodes({ onGg, onKonami }) {
  useEffect(() => {
    let konamiIndex = 0;
    let ggBuffer = '';
    let ggTimeout = null;

    const handleKeyDown = (event) => {
      if (isTypingContext(document.activeElement)) return;

      if (event.code === KONAMI_SEQUENCE[konamiIndex]) {
        konamiIndex += 1;
        if (konamiIndex === KONAMI_SEQUENCE.length) {
          konamiIndex = 0;
          onKonami?.();
        }
      } else {
        konamiIndex = event.code === KONAMI_SEQUENCE[0] ? 1 : 0;
      }

      if (event.key.length === 1) {
        ggBuffer += event.key.toLowerCase();
        clearTimeout(ggTimeout);
        ggTimeout = setTimeout(() => {
          ggBuffer = '';
        }, 1500);

        if (ggBuffer.endsWith('gg')) {
          ggBuffer = '';
          onGg?.();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(ggTimeout);
    };
  }, [onGg, onKonami]);
}

export default useSecretCodes;
