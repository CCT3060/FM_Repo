import { useWindowDimensions } from 'react-native';

export function useResponsiveMetrics() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= 768;
  const isCompact = width < 380;
  const horizontalPadding = isTablet ? 28 : isCompact ? 14 : 18;
  const contentMaxWidth = isTablet ? 760 : 680;
  const cardRadius = isTablet ? 22 : 18;

  const fluid = (compact: number, regular: number, tablet: number) => {
    if (isTablet) return tablet;
    if (isCompact) return compact;
    return regular;
  };

  return {
    width,
    height,
    isTablet,
    isCompact,
    horizontalPadding,
    contentMaxWidth,
    cardRadius,
    fluid,
  };
}