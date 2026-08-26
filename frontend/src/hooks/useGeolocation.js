/**
 * useGeolocation
 *
 * Multi-samples navigator.geolocation via watchPosition for a short window,
 * keeping the most accurate reading seen (lowest accuracy_meters). Exits early
 * once a good-enough fix is obtained, or after maxSamples / sampleWindowMs.
 *
 * A single getCurrentPosition call can return a stale/poor fix; sampling for a
 * few seconds and keeping the best result meaningfully improves fix quality.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export function useGeolocation({
  sampleWindowMs = 8000,
  maxSamples = 8,
  earlyStopAccuracyM = 15,
} = {}) {
  const [status, setStatus] = useState('idle'); // idle | sampling | ready | error | unsupported
  const [bestSample, setBestSample] = useState(null);
  const [samplesCollected, setSamplesCollected] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);

  const watchIdRef = useRef(null);
  const timeoutIdRef = useRef(null);
  const startTimeRef = useRef(null);
  const bestSampleRef = useRef(null);
  const samplesRef = useRef(0);

  const clearWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (timeoutIdRef.current !== null) {
      clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = null;
    }
  }, []);

  const finish = useCallback(() => {
    clearWatch();
    setElapsedMs(Date.now() - (startTimeRef.current || Date.now()));
    setStatus(bestSampleRef.current ? 'ready' : 'error');
    setErrorMessage((prev) => prev || (bestSampleRef.current ? null : 'Could not get a location fix.'));
  }, [clearWatch]);

  const stop = useCallback(() => {
    finish();
  }, [finish]);

  const reset = useCallback(() => {
    clearWatch();
    bestSampleRef.current = null;
    samplesRef.current = 0;
    startTimeRef.current = null;
    setBestSample(null);
    setSamplesCollected(0);
    setElapsedMs(0);
    setErrorMessage(null);
    setStatus('idle');
  }, [clearWatch]);

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus('unsupported');
      setErrorMessage('Geolocation is not supported by your browser');
      return;
    }

    clearWatch();
    bestSampleRef.current = null;
    samplesRef.current = 0;
    setBestSample(null);
    setSamplesCollected(0);
    setErrorMessage(null);
    setStatus('sampling');
    startTimeRef.current = Date.now();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const sample = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy_meters: position.coords.accuracy,
          altitude_meters: position.coords.altitude,
          timestamp: new Date().toISOString(),
        };

        samplesRef.current += 1;
        setSamplesCollected(samplesRef.current);

        if (!bestSampleRef.current || sample.accuracy_meters < bestSampleRef.current.accuracy_meters) {
          bestSampleRef.current = sample;
          setBestSample(sample);
        }

        if (
          bestSampleRef.current.accuracy_meters <= earlyStopAccuracyM ||
          samplesRef.current >= maxSamples
        ) {
          finish();
        }
      },
      (geoError) => {
        // Only treat as fatal if no usable sample has been captured yet -
        // a transient error mid-sampling shouldn't discard a good earlier fix.
        if (bestSampleRef.current) return;

        let message = 'Failed to get location';
        switch (geoError.code) {
          case geoError.PERMISSION_DENIED:
            message = 'Location permission denied. Please allow location access in your browser settings.';
            break;
          case geoError.POSITION_UNAVAILABLE:
            message = 'Location unavailable. Please check your GPS/location settings.';
            break;
          case geoError.TIMEOUT:
            message = 'Location request timed out. Please try again.';
            break;
        }
        setErrorMessage(message);
        finish();
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );

    timeoutIdRef.current = setTimeout(finish, sampleWindowMs);
  }, [clearWatch, finish, sampleWindowMs, maxSamples, earlyStopAccuracyM]);

  useEffect(() => () => clearWatch(), [clearWatch]);

  return { status, bestSample, samplesCollected, elapsedMs, errorMessage, start, stop, reset };
}

export default useGeolocation;
