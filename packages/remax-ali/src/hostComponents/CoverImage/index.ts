import * as React from 'react';
import { createHostComponent } from '@remax/shared';

export interface CoverImageProps {
  readonly dataset?: DOMStringMap;
  className?: string;
  style?: React.CSSProperties;
  src?: string;
  onTap?: (e: any) => void;
}

export const CoverImage: React.ComponentType<CoverImageProps> = createHostComponent<CoverImageProps>('cover-image');
