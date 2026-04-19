import { useLocation } from 'react-router-dom'
import type { NavTab } from '../components/TopNav'

const PATH_TO_TAB: Record<string, NavTab> = {
  '/gallery': 'gallery',
  '/studio': 'studio',
  '/profile': 'profile',
}

const TAB_TO_PATH: Record<NavTab, string> = {
  gallery: '/gallery',
  studio: '/studio',
  profile: '/profile',
}

export function useActiveTab(): NavTab {
  const { pathname } = useLocation()
  for (const [prefix, tab] of Object.entries(PATH_TO_TAB)) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      return tab
    }
  }
  return 'gallery'
}

export function pathForTab(tab: NavTab): string {
  return TAB_TO_PATH[tab]
}
