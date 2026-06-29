'use client'

import Image from 'next/image'
import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { SplitText } from 'gsap/SplitText'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, SplitText)

const STATS = [
  { end: 30, step: 1, suffix: 'k+', label: 'Users' },
  { end: 2, step: 0.1, suffix: 'M', label: 'Swipes' },
  { end: 1, step: 1, suffix: 'k+', label: 'Opportunities' },
] as const

function formatStatValue(val: number, step: number, suffix: string) {
  const snapped = gsap.utils.snap(step, val)
  if (suffix === 'M') {
    return snapped % 1 === 0 ? `${snapped}M` : `${snapped.toFixed(1)}M`
  }
  return `${Math.round(snapped)}${suffix}`
}

export default function Hero() {
  const sectionRef = useRef<HTMLElement>(null)
  const badgesRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const mainTextRef = useRef<HTMLSpanElement>(null)
  const clickWordRef = useRef<HTMLSpanElement>(null)
  const descRef = useRef<HTMLParagraphElement>(null)
  const buttonsRef = useRef<HTMLDivElement>(null)
  const statsRef = useRef<HTMLDivElement>(null)
  const phoneRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (!phoneRef.current) return

      gsap.fromTo(phoneRef.current, {
        y: 0,
      }, {
        y: 100,
        ease: 'sine.inOut',
        scrollTrigger: {
          trigger: sectionRef.current,
          start: 'top top',
          end: 'bottom top',
          scrub: 0.5,
        },
      })
    },
    { scope: sectionRef },
  )

  useGSAP(
    () => {
      if (!badgesRef.current) return

      const badges = gsap.utils.toArray<HTMLElement>(
        badgesRef.current.querySelectorAll(':scope > div'),
      )
      if (!badges.length) return

      gsap.fromTo(
        badges,
        { opacity: 0 },
        { opacity: 1, duration: 0.6, ease: 'power2.out', stagger: 0.18, delay: 2.2 },
      )
    },
    { scope: badgesRef },
  )

  useGSAP(
    () => {
      if (!mainTextRef.current || !clickWordRef.current) return

      const split = SplitText.create(mainTextRef.current, { type: 'chars' })

      gsap.set(clickWordRef.current, { opacity: 0 })

      const tl = gsap.timeline()

      if (phoneRef.current) {
        tl.from(
          phoneRef.current,
          {
            xPercent: 10,
            yPercent: 10,
            opacity: 0,
            duration: 1.2,
            ease: 'power3.out',
          },
          0,
        )
      }

      tl.from(
        split.chars,
        {
          opacity: 0,
          duration: 0.001,
          stagger: 0.045,
          ease: 'none',
        },
        0,
      )
        .set(clickWordRef.current, { opacity: 1 })
        .to(clickWordRef.current, {
          scale: 0.9,
          duration: 0.08,
          ease: 'power2.out',
        })
        .to(clickWordRef.current, {
          scale: 1,
          duration: 0.35,
          ease: 'back.out(4)',
        })
    },
    { scope: sectionRef },
  )

  useGSAP(
    () => {
      if (!descRef.current) return

      gsap.from(descRef.current, {
        opacity: 0,
        duration: 1,
        ease: 'power2.out',
        delay: 2.2,
      })
    },
    { scope: descRef },
  )

  useGSAP(
    () => {
      if (!buttonsRef.current) return

      const buttons = gsap.utils.toArray<HTMLElement>(
        buttonsRef.current.querySelectorAll('button'),
      )
      if (!buttons.length) return

      gsap.fromTo(
        buttons,
        { opacity: 0 },
        { opacity: 1, duration: 0.6, ease: 'power2.out', stagger: 0.18, delay: 2.4 },
      )
    },
    { scope: buttonsRef },
  )

  useGSAP(
    () => {
      if (!statsRef.current) return

      const items = gsap.utils.toArray<HTMLElement>(
        statsRef.current.querySelectorAll('[data-stat-item]'),
      )
      if (!items.length) return

      const tl = gsap.timeline({ delay: 2.6 })
      const itemGap = 0.2

      items.forEach((item, i) => {
        const valueEl = item.querySelector('[data-stat-value]')
        const labelEl = item.querySelector('[data-stat-label]')
        if (!valueEl || !labelEl) return

        const end = Number(item.dataset.end)
        const step = Number(item.dataset.step)
        const suffix = item.dataset.suffix ?? ''
        const counter = { val: 0 }
        const position = i * itemGap

        gsap.set(item, { opacity: 0 })
        gsap.set(labelEl, { opacity: 0 })
        valueEl.textContent = formatStatValue(0, step, suffix)

        tl.to(
          item,
          { opacity: 1, duration: 0.35, ease: 'power2.out' },
          position,
        )

        tl.to(
          counter,
          {
            val: end,
            duration: 1,
            ease: 'power2.out',
            snap: { val: step },
            onUpdate: () => {
              valueEl.textContent = formatStatValue(counter.val, step, suffix)
            },
          },
          position,
        )

        tl.to(
          labelEl,
          { opacity: 1, duration: 0.5, ease: 'power2.out' },
          position + 0.3,
        )
      })

      const dividers = gsap.utils.toArray<HTMLElement>(
        statsRef.current.querySelectorAll('[data-stat-divider]'),
      )
      dividers.forEach((divider, i) => {
        gsap.set(divider, { opacity: 0 })
        tl.to(
          divider,
          { opacity: 1, duration: 0.35, ease: 'power2.out' },
          (i + 1) * itemGap,
        )
      })
    },
    { scope: statsRef },
  )

  return (
    <section
      ref={sectionRef}
      className="relative min-h-[785px] w-full overflow-hidden bg-[#121212]"
    >
      {/* ── Background photo (overlay baked into export) ───────────── */}
      <div className="pointer-events-none absolute inset-0">
        <Image
          src="/hero/bg.jpg"
          alt=""
          fill
          className="object-cover object-center"
          priority
        />
      </div>

      {/* ── Radial gradient overlay — transparent oval at bottom-center,
           dark semi-transparent corners ───────────────────────────── */}
      <div
        className="pointer-events-none absolute top-0 left-0 right-0 h-1/2"
        style={{
          background:
            'radial-gradient(ellipse 100% 65% at 50% 100%, transparent 30%, rgba(19,21,21,0.45) 60%, rgba(19,21,21,0.78) 100%)',
        }}
      />

      {/* ── Radial gradient overlay — dark at bottom edge, transparent oval
           at top-center (mirrors the top gradient, flipped) ──────── */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-1/2"
        style={{
          background:
            'radial-gradient(ellipse 100% 65% at 50% 0%, transparent 30%, rgba(19,21,21,0.45) 60%, rgba(18,18,18,1) 100%)',
        }}
      />

      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-1/2 z-10"
        style={{
          background:
            'linear-gradient(to bottom, transparent 0%, rgba(19,21,21,0.1) 60%, rgba(18,18,18,1) 100%)',
        }}
      />

      {/* ── Phone mockup (desktop only) ──────────────────────────────── */}
      <div
        ref={phoneRef}
        className="pointer-events-none absolute bottom-[-167px] hidden h-[848px] w-[678px] lg:block right-0"
      >
        <Image
          src="/hero/hand.png"
          alt="hand holding mobile device"
          fill
          className="object-contain object-top"
        />
      </div>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="relative z-10 px-6 pt-24 pb-14 lg:pt-[154px] lg:pb-0 z-20">
        <div className="flex max-w-[740px] flex-col gap-16 lg:gap-[130px]">

          {/* Content group: badges → heading → body → buttons */}
          <div className="flex flex-col gap-8 lg:gap-10">

            {/* H1 cluster */}
            <div className="flex flex-col gap-4 lg:gap-5">

              {/* Brow badges */}
              <div ref={badgesRef} className="flex flex-wrap items-center gap-4">
                {/* 4.8 APP RATING badge */}
                <div
                  className="flex h-7 items-center gap-[10px] rounded-[4px] px-2"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.10)',
                    backdropFilter: 'blur(10px) saturate(160%)',
                    WebkitBackdropFilter: 'blur(10px) saturate(160%)',
                    boxShadow: [
                      'inset 0 0 0 1px rgba(255,255,255,0.08)',
                      'inset 1.8px 3px 0px -2px rgba(255,255,255,0.50)',
                      'inset -2px -2px 0px -2px rgba(255,255,255,0.44)',
                      'inset -3px -8px 1px -6px rgba(255,255,255,0.32)',
                      'inset -0.3px -1px 4px 0px rgba(0,0,0,0.24)',
                      'inset -1.5px 2.5px 0px -2px rgba(0,0,0,0.40)',
                      'inset 0px 3px 4px -2px rgba(0,0,0,0.40)',
                      'inset 2px -6.5px 1px -4px rgba(0,0,0,0.20)',
                      '0px 1px 5px 0px rgba(0,0,0,0.20)',
                      '0px 6px 16px 0px rgba(0,0,0,0.16)',
                    ].join(', '),
                  }}
                >
                  <div className="flex items-center justify-center rounded-[2px] bg-[#b42d55] px-2 py-1">
                    <span className="font-inter text-[10px] font-medium leading-none text-white">
                      4.8
                    </span>
                  </div>
                  <span className="font-inter text-[10px] font-medium leading-none text-white">
                    APP RATING
                  </span>
                </div>

                {/* App store stars badge */}
                <div
                  className="flex h-7 items-center justify-center rounded-[4px] px-[8px]"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.10)',
                    backdropFilter: 'blur(10px) saturate(160%)',
                    WebkitBackdropFilter: 'blur(10px) saturate(160%)',
                    boxShadow: [
                      'inset 0 0 0 1px rgba(255,255,255,0.08)',
                      'inset 1.8px 3px 0px -2px rgba(255,255,255,0.50)',
                      'inset -2px -2px 0px -2px rgba(255,255,255,0.44)',
                      'inset -3px -8px 1px -6px rgba(255,255,255,0.32)',
                      'inset -0.3px -1px 4px 0px rgba(0,0,0,0.24)',
                      'inset -1.5px 2.5px 0px -2px rgba(0,0,0,0.40)',
                      'inset 0px 3px 4px -2px rgba(0,0,0,0.40)',
                      'inset 2px -6.5px 1px -4px rgba(0,0,0,0.20)',
                      '0px 1px 5px 0px rgba(0,0,0,0.20)',
                      '0px 6px 16px 0px rgba(0,0,0,0.16)',
                    ].join(', '),
                  }}
                >
                  <Image
                    src="/hero/app_rating.png"
                    alt="App store star rating"
                    width={56}
                    height={17}
                  />
                </div>
              </div>

              {/* Heading */}
              <h1
                ref={headingRef}
                className="font-sora max-w-[698px] text-[40px] font-normal leading-[1.05] tracking-[-2px] text-white lg:text-[64px] lg:leading-[66px] lg:tracking-[-3.2px]"
              >
                <span ref={mainTextRef}>Where founders, talent and startups </span>
                <span ref={clickWordRef} className="inline-block origin-center">click.</span>
              </h1>
            </div>

            {/* Body copy */}
            <p
              ref={descRef}
              className="font-inter max-w-[438px] text-[16px] font-normal leading-[1.4] tracking-[-0.2px] text-[#bbbbbb] lg:text-[18px] lg:leading-[23px]"
            >
              We match builders to{' '}
              <strong className="font-semibold text-white">early-stage startups</strong>{' '}
              based on what you&apos;ve actually shipped. Real 0-to-1{' '}
              <strong className="font-semibold text-white">
                experience, ownership, and speed.
              </strong>
            </p>

            {/* CTA buttons */}
            <div ref={buttonsRef} className="flex flex-wrap items-start gap-4">
              <button
                type="button"
                className="overflow-hidden rounded-lg border-[1.75px] border-white/[0.16]"
              >
                <span className="flex items-center justify-center rounded-lg bg-[#b42d55] px-6 py-3">
                  <span className="font-inter text-[14px] font-semibold leading-[1.4] whitespace-nowrap text-white">
                    Get started
                  </span>
                </span>
              </button>

              <button
                type="button"
                className="flex items-center justify-center rounded-lg px-6 py-3"
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.10)',
                  // backdropFilter: 'blur(10px) saturate(160%)',
                  // WebkitBackdropFilter: 'blur(10px) saturate(160%)',
                  boxShadow: [
                    'inset 0 0 0 1px rgba(255,255,255,0.08)',
                    'inset 1.8px 3px 0px -2px rgba(255,255,255,0.50)',
                    'inset -2px -2px 0px -2px rgba(255,255,255,0.44)',
                    'inset -3px -8px 1px -6px rgba(255,255,255,0.32)',
                    'inset -0.3px -1px 4px 0px rgba(0,0,0,0.24)',
                    'inset -1.5px 2.5px 0px -2px rgba(0,0,0,0.40)',
                    'inset 0px 3px 4px -2px rgba(0,0,0,0.40)',
                    'inset 2px -6.5px 1px -4px rgba(0,0,0,0.20)',
                    '0px 1px 5px 0px rgba(0,0,0,0.20)',
                    '0px 6px 16px 0px rgba(0,0,0,0.16)',
                  ].join(', '),
                }}
              >
                <span className="font-inter text-[14px] font-semibold leading-[1.4] whitespace-nowrap text-white">
                  Learn more
                </span>
              </button>
            </div>
          </div>

          {/* Stats bar */}
          <div
            ref={statsRef}
            className="w-full rounded-[10.5px] p-[14px] lg:w-auto lg:self-start"
          >
            <div className="flex items-start gap-6">
              {STATS.map((stat, i) => (
                <div key={stat.label} className="contents">
                  {i > 0 && <StatDivider />}
                  <StatItem {...stat} />
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </section>
  )
}

function StatItem({
  end,
  step,
  suffix,
  label,
}: {
  end: number
  step: number
  suffix: string
  label: string
}) {
  return (
    <div
      data-stat-item
      data-end={end}
      data-step={step}
      data-suffix={suffix}
      className="flex w-[75px] flex-col gap-[7px]"
    >
      <span
        data-stat-value
        className="font-sora text-[24px] font-normal leading-[30px] tracking-[-0.3px] text-white"
      >
        {formatStatValue(0, step, suffix)}
      </span>
      <span
        data-stat-label
        className="font-inter text-[14px] font-semibold leading-[22px] text-[#cccccc]"
      >
        {label}
      </span>
    </div>
  )
}

function StatDivider() {
  return (
    <div
      data-stat-divider
      className="w-px self-stretch shrink-0 bg-gradient-to-b from-white/10 to-transparent"
    />
  )
}
