import { useCallback, useEffect, useState } from 'react';
import { getIsOnline, subscribeNetworkStatus } from '../utils/networkStatus';

/**
 * Returns the current online/offline status. Automatically re-renders the
 * component whenever the network transitions between online and offline.
 */
export function useNetworkStatus(): boolean {
  const [isOnline, setIsOnline] = useState(getIsOnline());

  const handleChange = useCallback((online: boolean) => {
    setIsOnline(online);
  }, []);

  useEffect(() => {
    return subscribeNetworkStatus(handleChange);
  }, [handleChange]);

  return isOnline;
}
