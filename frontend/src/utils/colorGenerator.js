/**
 * Dynamic Color Palette Generator
 * 
 * Generates a complete color scale (50-950) from a single primary color.
 * Uses HSL color space for accurate lightness manipulation.
 * 
 * Output format matches Tailwind's color scale:
 * - 50: Lightest (backgrounds, subtle highlights)
 * - 100-400: Light shades (secondary backgrounds, borders)
 * - 500: Base color (primary buttons, icons)
 * - 600: Slightly darker (hover states)
 * - 700-800: Dark shades (text, dark backgrounds)
 * - 900-950: Darkest (headings, high contrast)
 */

/**
 * Convert HEX to HSL
 * @param {string} hex - Hex color (e.g., "#1a5f2a")
 * @returns {object} - { h, s, l } values
 */
export function hexToHsl(hex) {
  // Remove # if present
  hex = hex.replace(/^#/, '');
  
  // Handle shorthand hex (e.g., #abc -> #aabbcc)
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('');
  }
  
  // Parse RGB values
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;
  
  if (max === min) {
    h = s = 0; // Achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
      default:
        h = 0;
    }
  }
  
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Convert HSL to HEX
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {string} - Hex color
 */
export function hslToHex(h, s, l) {
  s /= 100;
  l /= 100;
  
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  
  if (0 <= h && h < 60) {
    r = c; g = x; b = 0;
  } else if (60 <= h && h < 120) {
    r = x; g = c; b = 0;
  } else if (120 <= h && h < 180) {
    r = 0; g = c; b = x;
  } else if (180 <= h && h < 240) {
    r = 0; g = x; b = c;
  } else if (240 <= h && h < 300) {
    r = x; g = 0; b = c;
  } else if (300 <= h && h < 360) {
    r = c; g = 0; b = x;
  }
  
  r = Math.round((r + m) * 255);
  g = Math.round((g + m) * 255);
  b = Math.round((b + m) * 255);
  
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Generate complete color palette from a single color
 * @param {string} baseColor - Base hex color (e.g., "#1a5f2a")
 * @returns {object} - Color palette object with shades 50-950
 */
export function generateColorPalette(baseColor) {
  const { h, s, l } = hexToHsl(baseColor);
  
  // Tailwind shade definitions
  // Each shade has a target lightness value
  const shadeConfig = {
    50:  { lightness: 99, saturationMod: 1.0 },   // Very light (almost white with hint of color)
    100: { lightness: 94, saturationMod: 0.95 },
    200: { lightness: 86, saturationMod: 1.0 },
    300: { lightness: 74, saturationMod: 1.0 },
    400: { lightness: 60, saturationMod: 1.0 },
    500: { lightness: l, saturationMod: 1.0 },    // Base color lightness
    600: { lightness: Math.max(l - 10, 25), saturationMod: 1.05 },
    700: { lightness: Math.max(l - 20, 20), saturationMod: 1.1 },
    800: { lightness: Math.max(l - 30, 15), saturationMod: 1.1 },
    900: { lightness: Math.max(l - 40, 10), saturationMod: 1.05 },
    950: { lightness: Math.max(l - 50, 5), saturationMod: 1.0 },
  };
  
  const palette = {};
  
  for (const [shade, config] of Object.entries(shadeConfig)) {
    let targetLightness;
    
    if (shade === '500') {
      // Keep base color exactly
      targetLightness = l;
    } else {
      // Adjust based on the base color's actual lightness
      targetLightness = config.lightness;
      
      // For shades below 500, compress toward base if base is dark
      if (parseInt(shade) < 500 && l < 40) {
        const factor = l / 40;
        targetLightness = config.lightness * (0.7 + 0.3 * factor);
      }
      
      // For shades above 500, compress if base is light
      if (parseInt(shade) > 500 && l > 60) {
        const factor = (100 - l) / 40;
        targetLightness = l - (l - config.lightness) * (0.7 + 0.3 * factor);
      }
    }
    
    const adjustedSaturation = Math.min(100, s * config.saturationMod);
    
    palette[shade] = hslToHex(h, adjustedSaturation, targetLightness);
  }
  
  // Add 'DEFAULT' as alias for 500
  palette.DEFAULT = palette['500'];
  
  return palette;
}

/**
 * Generate CSS custom properties from color palette
 * @param {string} prefix - CSS variable prefix (e.g., "primary")
 * @param {object} palette - Color palette from generateColorPalette
 * @returns {object} - CSS properties object
 */
export function generateCSSVariables(prefix, palette) {
  const variables = {};
  
  for (const [shade, color] of Object.entries(palette)) {
    if (shade === 'DEFAULT') continue;
    variables[`--color-${prefix}-${shade}`] = color;
  }
  
  // Also add HSL values for opacity utilities
  const { h, s, l } = hexToHsl(palette['500']);
  variables[`--color-${prefix}-hsl`] = `${h} ${s}% ${l}%`;
  
  return variables;
}

/**
 * Apply branding colors to document
 * @param {string} primaryColor - Primary brand color
 * @param {string|null} secondaryColor - Secondary brand color (optional)
 */
export function applyBrandingColors(primaryColor, secondaryColor = null) {
  if (!primaryColor) return;
  
  const root = document.documentElement;
  
  // Generate and apply primary palette
  const primaryPalette = generateColorPalette(primaryColor);
  const primaryVars = generateCSSVariables('primary', primaryPalette);
  
  for (const [prop, value] of Object.entries(primaryVars)) {
    root.style.setProperty(prop, value);
  }
  
  // Generate and apply secondary palette if provided
  if (secondaryColor) {
    const secondaryPalette = generateColorPalette(secondaryColor);
    const secondaryVars = generateCSSVariables('secondary', secondaryPalette);
    
    for (const [prop, value] of Object.entries(secondaryVars)) {
      root.style.setProperty(prop, value);
    }
  }
}

/**
 * Remove branding colors (reset to defaults)
 */
export function removeBrandingColors() {
  const root = document.documentElement;
  const shades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
  
  for (const shade of shades) {
    root.style.removeProperty(`--color-primary-${shade}`);
    root.style.removeProperty(`--color-secondary-${shade}`);
  }
  root.style.removeProperty('--color-primary-hsl');
  root.style.removeProperty('--color-secondary-hsl');
}

/**
 * Get contrasting text color (black or white) for a given background
 * @param {string} bgColor - Background hex color
 * @returns {string} - '#ffffff' or '#000000'
 */
export function getContrastTextColor(bgColor) {
  const { l } = hexToHsl(bgColor);
  return l > 50 ? '#000000' : '#ffffff';
}

export default {
  hexToHsl,
  hslToHex,
  generateColorPalette,
  generateCSSVariables,
  applyBrandingColors,
  removeBrandingColors,
  getContrastTextColor,
};
