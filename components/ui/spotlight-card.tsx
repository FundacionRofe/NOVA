import React, { useEffect, useRef, ReactNode } from 'react';

// Ajustes respecto al componente original (marcados con «NOVA:»):
//  1. glowColor 'nova': recorre la paleta de marca (orquídea → amarillo → aguamarina) según el puntero.
//  2. touchAction 'pan-y' en vez de 'none': con 'none' no se puede hacer scroll en celular
//     cuando el dedo empieza sobre una tarjeta (el tablero está lleno de tarjetas).
//  3. baseStyles tipado: el original asignaba width/height a un objeto literal sin esas
//     propiedades y no compila con TypeScript estricto.
//  4. Brillo por cercanía: el original usaba coordenadas de la ventana + background-attachment
//     fixed, que se rompe si algún contenedor tiene transform (las animaciones GSAP lo dejan) y
//     hacía que TODAS las tarjetas se iluminaran a la vez en el mismo punto relativo. Ahora --x/--y
//     son relativas a cada tarjeta (attachment scroll): solo se ilumina el borde de las tarjetas que
//     estén a menos del radio del brillo, por el lado más cercano al mouse. Se recalcula al hacer scroll.

interface GlowCardProps {
  children: ReactNode;
  className?: string;
  glowColor?: 'blue' | 'purple' | 'green' | 'red' | 'orange' | 'nova';
  size?: 'sm' | 'md' | 'lg';
  width?: string | number;
  height?: string | number;
  customSize?: boolean; // When true, ignores size prop and uses width/height or className
}

const glowColorMap = {
  blue: { base: 220, spread: 200 },
  purple: { base: 280, spread: 300 },
  green: { base: 120, spread: 200 },
  red: { base: 0, spread: 200 },
  orange: { base: 30, spread: 200 },
  nova: { base: 315, spread: 215 } // NOVA: orquídea (315) → amarillo (~48) → aguamarina (~170)
};

const sizeMap = {
  sm: 'w-48 h-64',
  md: 'w-64 h-80',
  lg: 'w-80 h-96'
};

const GlowCard: React.FC<GlowCardProps> = ({
  children,
  className = '',
  glowColor = 'blue',
  size = 'md',
  width,
  height,
  customSize = false
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // NOVA: coordenadas relativas a la tarjeta (ver nota 4)
    let px = -9999, py = -9999;
    const aplicar = () => {
      const el = cardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--x', (px - r.left).toFixed(2));
      el.style.setProperty('--y', (py - r.top).toFixed(2));
      el.style.setProperty('--xp', (px / window.innerWidth).toFixed(2));
      el.style.setProperty('--yp', (py / window.innerHeight).toFixed(2));
    };
    const syncPointer = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      aplicar();
    };
    const fuera = () => { px = py = -9999; aplicar(); };

    document.addEventListener('pointermove', syncPointer);
    document.addEventListener('pointerleave', fuera);
    window.addEventListener('scroll', aplicar, { passive: true });
    aplicar();
    return () => {
      document.removeEventListener('pointermove', syncPointer);
      document.removeEventListener('pointerleave', fuera);
      window.removeEventListener('scroll', aplicar);
    };
  }, []);

  const { base, spread } = glowColorMap[glowColor];

  // Determine sizing
  const getSizeClasses = () => {
    if (customSize) {
      return ''; // Let className or inline styles handle sizing
    }
    return sizeMap[size];
  };

  const getInlineStyles = () => {
    // NOVA: tipado para admitir width/height y variables CSS
    const baseStyles: React.CSSProperties & Record<string, string | number> = {
      '--base': base,
      '--spread': spread,
      '--radius': '14',
      '--border': '3',
      '--backdrop': 'hsl(0 0% 60% / 0.12)',
      '--backup-border': 'var(--backdrop)',
      '--size': '200',
      '--outer': '1',
      '--border-size': 'calc(var(--border, 2) * 1px)',
      '--spotlight-size': 'calc(var(--size, 150) * 1px)',
      '--hue': 'calc(var(--base) + (var(--xp, 0) * var(--spread, 0)))',
      backgroundImage: `radial-gradient(
        var(--spotlight-size) var(--spotlight-size) at
        calc(var(--x, 0) * 1px)
        calc(var(--y, 0) * 1px),
        hsl(var(--hue, 210) calc(var(--saturation, 100) * 1%) calc(var(--lightness, 70) * 1%) / var(--bg-spot-opacity, 0.1)), transparent
      )`,
      backgroundColor: 'var(--backdrop, transparent)',
      backgroundSize: 'calc(100% + (2 * var(--border-size))) calc(100% + (2 * var(--border-size)))',
      backgroundPosition: '50% 50%',
      backgroundAttachment: 'scroll', // NOVA: era 'fixed' (ver nota 4)
      border: 'var(--border-size) solid var(--backup-border)',
      position: 'relative' as const,
      touchAction: 'pan-y' as const, // NOVA: era 'none' (bloqueaba el scroll táctil)
    };

    // Add width and height if provided
    if (width !== undefined) {
      baseStyles.width = typeof width === 'number' ? `${width}px` : width;
    }
    if (height !== undefined) {
      baseStyles.height = typeof height === 'number' ? `${height}px` : height;
    }

    return baseStyles;
  };

  const beforeAfterStyles = `
    [data-glow]::before,
    [data-glow]::after {
      pointer-events: none;
      content: "";
      position: absolute;
      inset: calc(var(--border-size) * -1);
      border: var(--border-size) solid transparent;
      border-radius: calc(var(--radius) * 1px);
      background-attachment: scroll;
      background-size: calc(100% + (2 * var(--border-size))) calc(100% + (2 * var(--border-size)));
      background-repeat: no-repeat;
      background-position: 50% 50%;
      mask: linear-gradient(transparent, transparent), linear-gradient(white, white);
      mask-clip: padding-box, border-box;
      mask-composite: intersect;
    }

    [data-glow]::before {
      background-image: radial-gradient(
        calc(var(--spotlight-size) * 0.75) calc(var(--spotlight-size) * 0.75) at
        calc(var(--x, 0) * 1px)
        calc(var(--y, 0) * 1px),
        hsl(var(--hue, 210) calc(var(--saturation, 100) * 1%) calc(var(--lightness, 50) * 1%) / var(--border-spot-opacity, 1)), transparent 100%
      );
      filter: brightness(2);
    }

    [data-glow]::after {
      background-image: radial-gradient(
        calc(var(--spotlight-size) * 0.5) calc(var(--spotlight-size) * 0.5) at
        calc(var(--x, 0) * 1px)
        calc(var(--y, 0) * 1px),
        hsl(0 100% 100% / var(--border-light-opacity, 1)), transparent 100%
      );
    }

    [data-glow] [data-glow] {
      position: absolute;
      inset: 0;
      will-change: filter;
      opacity: var(--outer, 1);
      border-radius: calc(var(--radius) * 1px);
      border-width: calc(var(--border-size) * 20);
      filter: blur(calc(var(--border-size) * 10));
      background: none;
      pointer-events: none;
      border: none;
    }

    [data-glow] > [data-glow]::before {
      inset: -10px;
      border-width: 10px;
    }
  `;

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: beforeAfterStyles }} />
      <div
        ref={cardRef}
        data-glow
        style={getInlineStyles()}
        className={`
          ${getSizeClasses()}
          ${!customSize ? 'aspect-[3/4]' : ''}
          rounded-2xl
          relative
          grid
          grid-rows-[1fr_auto]
          shadow-[0_1rem_2rem_-1rem_black]
          p-4
          gap-4
          backdrop-blur-[5px]
          ${className}
        `}
      >
        <div ref={innerRef} data-glow></div>
        {children}
      </div>
    </>
  );
};

export { GlowCard }
