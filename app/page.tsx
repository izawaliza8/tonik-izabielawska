'use client'
import dynamic from 'next/dynamic'
import Hero from './components/Hero'
import LogoMarquee from './components/LogoMarquee'
import { GLOBE_SECTION_HEIGHT_VH } from './components/globeScrollLayout'

const Globe = dynamic(() => import('./components/Globe'), { ssr: false })
const GlobeV2 = dynamic(() => import('./components/GlobeV2'), { ssr: false })
const GlobeV3 = dynamic(() => import('./components/GlobeV3'), { ssr: false })
const GlobeV4 = dynamic(() => import('./components/GlobeV4'), { ssr: false })

export default function Home() {
  return (
    <div className="bg-[#121212]">
      <main className="flex flex-1 w-full flex-col items-center justify-between sm:items-start">
        <Hero />
        <LogoMarquee />
        {/* <section className="relative h-[300vh] w-full">
          <div className="sticky top-0 h-screen w-screen">
            <Globe />
          </div>
        </section> */}
        <section
          className="relative w-full"
          style={{ height: `${GLOBE_SECTION_HEIGHT_VH}vh` }}
        >
          <div className="sticky top-0 h-screen w-full overflow-hidden">
            <GlobeV4 />
          </div>
        </section>
      </main>
    </div>
  )
}
