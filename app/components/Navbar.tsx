'use client'

import { useRef } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import Logo from '@/app/components/Logo'

gsap.registerPlugin(ScrollTrigger)

export default function Navbar() {
  const navRef = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const navAnim = gsap
        .from(navRef.current, {
          yPercent: -100,
          duration: 0.2,
          ease: 'sine.inOut',
          paused: true,
        })
        .progress(1)

      ScrollTrigger.create({
        start: 80,
        end: 'max',
        onUpdate: ({ direction, scroll }) => {
          if (scroll() < 80) {
            navAnim.progress(1)
            return
          }

          direction === -1 ? navAnim.play() : navAnim.reverse()
        },
      })
    },
    { scope: navRef },
  )

  return (
    <nav
      ref={navRef}
      className="fixed top-0 left-0 right-0 z-50 w-full  px-6"
    >
      <div className="pt-5 w-full">
        <div className="flex items-center justify-between w-full">
          <div className="flex-1 min-w-0">
            <Logo />
          </div>
          <div className="flex flex-1 items-center justify-end gap-4 min-w-0">
            <a
              href="#"
              className="font-inter font-normal text-[13px] leading-5 text-white whitespace-nowrap"
            >
              Log in
            </a>
            <a
              href="#"
              className="shrink-0 rounded-[8px] border-[1.75px] border-white/16 bg-primary-600 px-6 py-3 font-inter font-semibold text-[14px] leading-[1.4] text-white whitespace-nowrap"
            >
              Sign up
            </a>
          </div>
        </div>
      </div>
    </nav>
  )
}
