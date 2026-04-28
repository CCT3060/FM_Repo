import { Dimensions, PixelRatio } from 'react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const BASE_WIDTH = 390;

export function scale(size: number): number {
  return (SCREEN_WIDTH / BASE_WIDTH) * size;
}

export function moderateScale(size: number, factor = 0.5): number {
  return size + (scale(size) - size) * factor;
}

export const screen = { width: SCREEN_WIDTH, height: SCREEN_HEIGHT };
export const isSmallScreen = SCREEN_WIDTH < 375;
export const isLargeScreen = SCREEN_WIDTH >= 428;
