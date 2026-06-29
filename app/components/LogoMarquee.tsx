'use client'

import { Fragment, useRef } from 'react'
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'

const DURATION = 30

type SimpleLogo = {
  kind: 'simple'
  src: string
  alt: string
  width: number
  height: number
}

type LogoItem = SimpleLogo | { kind: 'meta' }

const LOGOS: LogoItem[] = [
  { kind: 'simple', src: '/logos/google.svg',       alt: 'Google',             width: 74,  height: 24 },
  { kind: 'meta' },
  { kind: 'simple', src: '/logos/stripe.svg',       alt: 'Stripe',             width: 60,  height: 25 },
  { kind: 'simple', src: '/logos/stanford.svg',     alt: 'Stanford University', width: 97,  height: 21 },
  { kind: 'simple', src: '/logos/uc-berkeley.svg',  alt: 'UC Berkeley',        width: 123, height: 23 },
  { kind: 'simple', src: '/logos/harvard.svg',      alt: 'Harvard University', width: 117, height: 29 },
  { kind: 'simple', src: '/logos/microsoft.svg',    alt: 'Microsoft',          width: 126, height: 27 },
  { kind: 'simple', src: '/logos/y-combinator.svg', alt: 'Y Combinator',       width: 134, height: 27 },
  { kind: 'simple', src: '/logos/mit.svg',          alt: 'MIT',                width: 95,  height: 23 },
]

function MetaLogo({ labeled }: { labeled: boolean }) {
  return (
    <div
      className="relative shrink-0 overflow-hidden h-[37px] w-[128px]"
      role={labeled ? 'img' : undefined}
      aria-label={labeled ? 'Meta' : undefined}
    >
      {/* Infinity-M symbol — occupies the left ~22% of the container */}
      <div className="absolute top-[25.25%] right-[64.06%] bottom-[25.25%] left-[14.32%]">
        <img
          src="/logos/meta-symbol.svg"
          alt=""
          className="absolute block inset-0 max-w-none size-full"
        />
      </div>
      {/* "meta" wordmark — occupies the right ~54% */}
      <div className="absolute top-[26.84%] right-[14.4%] bottom-[25.27%] left-[40.49%]">
        <img
          src="/logos/meta-wordmark.svg"
          alt=""
          className="absolute block inset-0 max-w-none size-full"
        />
      </div>
    </div>
  )
}

function renderLogos(labeled: boolean) {
  return LOGOS.map((logo, i) => (
    <Fragment key={i}>
      {logo.kind === 'simple' ? (
        <img
          src={logo.src}
          alt={labeled ? logo.alt : ''}
          width={logo.width}
          height={logo.height}
          className="block shrink-0"
        />
      ) : (
        <MetaLogo labeled={labeled} />
      )}
      <span className="shrink-0 size-1.5 rounded-full bg-[#b42d55]" aria-hidden="true" />
    </Fragment>
  ))
}

export default function LogoMarquee() {
  const containerRef = useRef<HTMLDivElement>(null)
  const trackRef    = useRef<HTMLDivElement>(null)
  const set1Ref     = useRef<HTMLDivElement>(null)
  const tweenRef    = useRef<gsap.core.Tween | null>(null)

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      if (!trackRef.current || !set1Ref.current) return

      tweenRef.current = gsap.to(trackRef.current, {
        x: -set1Ref.current.offsetWidth,
        duration: DURATION,
        ease: 'none',
        repeat: -1,
      })
    },
    { scope: containerRef },
  )

  function handlePause()  { tweenRef.current?.pause() }
  function handleResume() { tweenRef.current?.resume() }

  return (
    <section
      className="relative w-full bg-[#121212] flex flex-col items-center gap-[48px] py-[48px] overflow-hidden"
      aria-label="Companies and institutions our talents and founders come from"
    >
      <p className="font-inter text-[18px] leading-[23px] tracking-[-0.2px] text-white font-normal px-6 text-center whitespace-nowrap">
        Companies, institutions our talents and founders come from
      </p>

      {/* Marquee strip */}
      <div
        ref={containerRef}
        className="w-full overflow-hidden"
        onMouseEnter={handlePause}
        onMouseLeave={handleResume}
      >
        <div ref={trackRef} className="flex w-max">
          {/* Primary set — screen readers see this */}
          <div ref={set1Ref} className="flex items-center gap-[60px] shrink-0 pr-[60px]">
            {renderLogos(true)}
          </div>
          {/* Duplicate set — invisible to screen readers */}
          <div aria-hidden="true" className="flex items-center gap-[60px] shrink-0 pr-[60px]">
            {renderLogos(false)}
          </div>
        </div>
      </div>

      {/* Decorative bottom-right gradient */}
      <div
        className="absolute bottom-0 right-0 h-[193px] w-[275px] flex items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
        <div className="-rotate-90 flex-none">
          <div className="h-[275px] w-[193px] relative">
            <img
              src="/logos/deco-right.svg"
              alt=""
              className="absolute block inset-0 max-w-none size-full"
            />
          </div>
        </div>
      </div>

      {/* Decorative bottom-left gradient */}
      <div
        className="absolute bottom-0 left-0 h-[195px] w-[224px] flex items-center justify-center pointer-events-none"
        aria-hidden="true"
      >
        <div className="rotate-90 flex-none">
          <div className="h-[224px] w-[195px] relative">
            <img
              src="/logos/deco-left.svg"
              alt=""
              className="absolute block inset-0 max-w-none size-full"
            />
          </div>
        </div>
      </div>

    
    </section>
  )
}
