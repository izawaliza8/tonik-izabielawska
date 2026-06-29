// Scroll travel budget for GlobeV4 ScrollTriggers (vh units).
// Section height is managed by the ScrollTrigger pin spacer (app/page.tsx).

export const SCROLL_PHASE1A_VH = 100 // globe grow
export const SCROLL_PHASE1B_VH = 100 // dots, beams, comets
export const SCROLL_PHASE1_VH = SCROLL_PHASE1A_VH + SCROLL_PHASE1B_VH
export const SCROLL_PHASE2_VH = 200  // portrait reveal
export const SCROLL_PHASE3_VH = 100  // equator spin
export const SCROLL_PHASE4_VH = 200  // text + dot sweep

export const GLOBE_SCROLL_TRAVEL_VH =
  SCROLL_PHASE1_VH + SCROLL_PHASE2_VH + SCROLL_PHASE3_VH + SCROLL_PHASE4_VH

export const GLOBE_SECTION_HEIGHT_VH = GLOBE_SCROLL_TRAVEL_VH + 100

// Cumulative ScrollTrigger start offsets (vh)
export const SCROLL_PHASE2_START_VH = SCROLL_PHASE1_VH
export const SCROLL_PHASE3_START_VH = SCROLL_PHASE1_VH + SCROLL_PHASE2_VH
export const SCROLL_PHASE4_START_VH =
  SCROLL_PHASE1_VH + SCROLL_PHASE2_VH + SCROLL_PHASE3_VH

// GSAP end values on a timeline ST are relative to that ST's start — use this for phase 1b length.
export const scrollOffsetVh = (vh: number) => `+=${vh}%` as const
