'use client';

import { useRef, useState, useCallback, useEffect, type CSSProperties, type ReactNode } from 'react';
import './LineSidebar.css';

// React Bits — LineSidebar (DavidHDev): https://reactbits.dev/components/line-sidebar
// installed via jsrepo; integration changes for controlled routing and reduced motion
// upstream license: https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md

type Falloff = 'linear' | 'smooth' | 'sharp';

export interface LineSidebarProps {
  items?: string[];
  accentColor?: string;
  textColor?: string;
  markerColor?: string;
  showIndex?: boolean;
  showMarker?: boolean;
  proximityRadius?: number;
  maxShift?: number;
  falloff?: Falloff;
  markerLength?: number;
  markerGap?: number;
  tickScale?: number;
  scaleTick?: boolean;
  itemGap?: number;
  fontSize?: number;
  smoothing?: number;
  defaultActive?: number | null;
  activeIndex?: number | null;
  reducedMotion?: boolean;
  ariaLabel?: string;
  renderItem?: (index: number, label: string, content: ReactNode) => ReactNode;
  onItemClick?: (index: number, label: string) => void;
  className?: string;
}

const FALLOFF_CURVES: Record<Falloff, (p: number) => number> = {
  linear: p => p,
  smooth: p => p * p * (3 - 2 * p),
  sharp: p => p * p * p
};

const DEFAULT_ITEMS = [
  'Overview',
  'Components',
  'Animations',
  'Backgrounds',
  'Showcase',
  'Playground',
  'Templates',
  'Changelog',
  'Community',
  'Resources',
  'Documentation',
  'Support'
];

const LineSidebar = ({
  items = DEFAULT_ITEMS,
  accentColor = '#A855F7',
  textColor = '#c4c4c4',
  markerColor = '#6c6c6c',
  showIndex = true,
  showMarker = true,
  proximityRadius = 100,
  maxShift = 30,
  falloff = 'smooth',
  markerLength = 60,
  markerGap = 0,
  tickScale = 0.5,
  scaleTick = true,
  itemGap = 20,
  fontSize = 1.1,
  smoothing = 100,
  defaultActive = null,
  activeIndex: controlledActive,
  reducedMotion = false,
  ariaLabel,
  renderItem,
  onItemClick,
  className = ''
}: LineSidebarProps) => {
  const listRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);
  const targetsRef = useRef<number[]>([]);
  const currentRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const activeRef = useRef<number | null>(controlledActive === undefined ? defaultActive : controlledActive);
  const smoothingRef = useRef(smoothing);
  const [internalActive, setInternalActive] = useState<number | null>(defaultActive);
  const activeIndex = controlledActive === undefined ? internalActive : controlledActive;

  // Single rAF loop that eases every item's --effect toward its target using
  // frame-rate independent exponential smoothing, so color, shift and scale
  // all move together without staggering CSS transitions.
  const runFrame = useCallback(function frame(now: number) {
    const dt = Math.min((now - lastRef.current) / 1000, 0.05);
    lastRef.current = now;
    const tau = Math.max(smoothingRef.current, 1) / 1000;
    const k = 1 - Math.exp(-dt / tau);

    let moving = false;
    const items = itemRefs.current;
    for (let i = 0; i < items.length; i++) {
      const el = items[i];
      if (!el) continue;
      const target = Math.max(targetsRef.current[i] || 0, activeRef.current === i ? 1 : 0);
      const cur = currentRef.current[i] || 0;
      const next = cur + (target - cur) * k;
      const settled = Math.abs(target - next) < 0.0015;
      const value = settled ? target : next;
      currentRef.current[i] = value;
      el.style.setProperty('--effect', value.toFixed(4));
      if (!settled) moving = true;
    }

    rafRef.current = moving ? requestAnimationFrame(frame) : null;
  }, []);

  const startLoop = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
    }
    lastRef.current = performance.now();
    rafRef.current = requestAnimationFrame(runFrame);
  }, [runFrame]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLUListElement>) => {
      if (reducedMotion || e.pointerType === "touch") return;
      const list = listRef.current;
      if (!list) return;
      const rect = list.getBoundingClientRect();
      const pointerY = e.clientY - rect.top;
      const ease = FALLOFF_CURVES[falloff] ?? FALLOFF_CURVES.linear;
      const items = itemRefs.current;
      for (let i = 0; i < items.length; i++) {
        const el = items[i];
        if (!el) continue;
        const center = el.offsetTop + el.offsetHeight / 2;
        const distance = Math.abs(pointerY - center);
        targetsRef.current[i] = ease(Math.max(0, 1 - distance / proximityRadius));
      }
      startLoop();
    },
    [falloff, proximityRadius, reducedMotion, startLoop]
  );

  const handlePointerLeave = useCallback(() => {
    if (reducedMotion) return;
    targetsRef.current = targetsRef.current.map(() => 0);
    startLoop();
  }, [reducedMotion, startLoop]);

  const handleClick = useCallback(
    (index: number, label: string) => {
      if (controlledActive === undefined) setInternalActive(index);
      onItemClick?.(index, label);
    },
    [controlledActive, onItemClick]
  );

  useEffect(() => {
    activeRef.current = activeIndex;
    smoothingRef.current = smoothing;
    if (reducedMotion) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      targetsRef.current = [];
      currentRef.current = [];
      itemRefs.current.forEach((el, index) => {
        const value = activeIndex === index ? 1 : 0;
        currentRef.current[index] = value;
        el?.style.setProperty('--effect', String(value));
      });
      return;
    }
    startLoop();
  }, [activeIndex, smoothing, reducedMotion, items.length, startLoop]);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    },
    []
  );

  return (
    <nav
      aria-label={ariaLabel}
      data-reduced-motion={reducedMotion || undefined}
      className={`line-sidebar${showMarker ? ' line-sidebar--markers' : ''}${scaleTick ? ' line-sidebar--scale-tick' : ''}${className ? ` ${className}` : ''}`}
      style={
        {
          '--accent-color': accentColor,
          '--text-color': textColor,
          '--marker-color': markerColor,
          '--marker-length': `${markerLength}px`,
          '--marker-gap': `${markerGap}px`,
          '--tick-scale': tickScale,
          '--max-shift': `${maxShift}px`,
          '--item-gap': `${itemGap}px`,
          '--font-size': `${fontSize}rem`,
          '--smoothing': `${smoothing}ms`
        } as CSSProperties
      }
    >
      <ul ref={listRef} className="line-sidebar__list" onPointerMove={handlePointerMove} onPointerLeave={handlePointerLeave}>
        {items.map((label, index) => {
          const content = <span className="line-sidebar__label">
            {showIndex && <span className="line-sidebar__index">{String(index + 1).padStart(2, '0')}</span>}
            <span className="line-sidebar__text">{label}</span>
          </span>;
          return <li
            key={`${label}-${index}`}
            ref={el => {
              itemRefs.current[index] = el;
            }}
            className="line-sidebar__item"
            data-active={activeIndex === index || undefined}
            aria-current={!renderItem && activeIndex === index ? 'true' : undefined}
            onClick={renderItem ? undefined : () => handleClick(index, label)}
          >
            {showMarker && <span className="line-sidebar__marker" aria-hidden="true" />}
            {renderItem ? renderItem(index, label, content) : content}
          </li>;
        })}
      </ul>
    </nav>
  );
};

export default LineSidebar;
