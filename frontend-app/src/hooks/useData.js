/**
 * SENTINEL — API data hooks
 * Polls the FastAPI backend and pushes data into the Zustand store.
 * Also updates position history on each poll for trail rendering.
 */

import { useEffect } from 'react'
import useStore from '../store'

const BASE = '/api'

async function fetchJSON(path) {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

// ── Aircraft — poll every 15s ─────────────────────────────────
export function useAircraftData() {
  const setAircraft          = useStore(s => s.setAircraft)
  const updatePositionHistory = useStore(s => s.updatePositionHistory)

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await fetchJSON('/live/aircraft')
        const aircraft = data.data || []
        setAircraft(aircraft)
        updatePositionHistory('aircraft', aircraft)
      } catch (e) {
        console.warn('Aircraft fetch failed:', e.message)
      }
    }
    poll()
    const id = setInterval(poll, 15000)
    return () => clearInterval(id)
  }, [])
}

// ── Satellites — poll every 10s ───────────────────────────────
export function useSatelliteData() {
  const setSatellites = useStore(s => s.setSatellites)

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await fetchJSON('/live/satellites')
        setSatellites(data.data || [])
      } catch (e) {
        console.warn('Satellite fetch failed:', e.message)
      }
    }
    poll()
    const id = setInterval(poll, 10000)
    return () => clearInterval(id)
  }, [])
}

// ── Vessels — poll every 20s ──────────────────────────────────
export function useVesselData() {
  const setVessels           = useStore(s => s.setVessels)
  const updatePositionHistory = useStore(s => s.updatePositionHistory)

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await fetchJSON('/live/vessels')
        const vessels = data.data || []
        setVessels(vessels)
        updatePositionHistory('vessels', vessels)
      } catch (e) {
        console.warn('Vessel fetch failed:', e.message)
      }
    }
    poll()
    const id = setInterval(poll, 20000)
    return () => clearInterval(id)
  }, [])
}

// ── Metrics — poll every 60s ──────────────────────────────────
export function useMetrics() {
  const setMetrics     = useStore(s => s.setMetrics)
  const setDataQuality = useStore(s => s.setDataQuality)

  useEffect(() => {
    const poll = async () => {
      try {
        const [metrics, quality] = await Promise.all([
          fetchJSON('/metrics/global'),
          fetchJSON('/quality'),
        ])
        setMetrics(metrics.data || [])
        setDataQuality(quality.data || [])
      } catch (e) {
        console.warn('Metrics fetch failed:', e.message)
      }
    }
    poll()
    const id = setInterval(poll, 60000)
    return () => clearInterval(id)
  }, [])
}

// ── Master hook — call once at app root ──────────────────────
export function useAllData() {
  useAircraftData()
  useSatelliteData()
  useVesselData()
  useMetrics()
}
