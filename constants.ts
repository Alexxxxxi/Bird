

export const SPECIES_CONFIG = {
  sparrow: { 
    body: '#795548', // Brown
    belly: '#D7CCC8', // Light Tan
    wing: '#4E342E', // Dark Brown
    beak: '#FFD54F', 
    type: 'round',
    tail: 'short'
  },
  robin: { 
    body: '#4E342E', // Dark Grey-Brown
    belly: '#FF5722', // Deep Orange Red
    wing: '#3E2723', 
    beak: '#FFEB3B', 
    type: 'round',
    tail: 'medium'
  },
  bluejay: { 
    body: '#2979FF', // Bright Blue
    belly: '#E3F2FD', // Whiteish
    wing: '#1565C0', // Darker Blue
    beak: '#212121', // Black
    type: 'crested',
    tail: 'long'
  },
  goldfinch: { 
    body: '#FFEB3B', // Bright Yellow
    belly: '#FFF9C4', // Pale Yellow
    wing: '#212121', // Black
    beak: '#FFAB91', // Pinkish
    type: 'small',
    tail: 'notched'
  },
  cardinal: { 
    body: '#D50000', // Deep Red
    belly: '#B71C1C', // Dark Red
    wing: '#800000', // Maroon
    beak: '#FF6F00', // Orange
    type: 'crested',
    tail: 'long'
  },
  swan: {
    body: '#FFFFFF',
    belly: '#ECEFF1', // Very light grey
    wing: '#CFD8DC', 
    beak: '#FF9800', 
    type: 'long_neck',
    tail: 'medium'
  },
  crow: {
    body: '#212121',
    belly: '#424242',
    wing: '#000000',
    beak: '#000000',
    type: 'round',
    tail: 'medium'
  },
  eagle: {
    body: '#5D4037', // Brown
    belly: '#3E2723', // Dark Brown
    wing: '#3E2723',
    beak: '#FFEB3B', // Yellow
    type: 'raptor',
    tail: 'fan'
  },
  owl: {
    body: '#8D6E63', // Greyish Brown
    belly: '#EFEBE9', // Light Grey
    wing: '#5D4037',
    beak: '#FFCC80', // Pale Orange
    type: 'round',
    tail: 'medium'
  },
  parrot: {
    body: '#D50000', // Macaw Red
    belly: '#FFEB3B', // Yellow
    wing: '#1976D2', // Blue wings
    beak: '#ECEFF1', // White/Bone
    type: 'long_tail',
    tail: 'long'
  },
  toucan: {
    body: '#212121', // Black
    belly: '#FFEB3B', // Yellow Throat
    wing: '#212121',
    beak: '#FF6F00', // Orange/Multi
    type: 'round',
    tail: 'medium'
  }
};

export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
  [0, 5], [5, 6], [6, 7], [7, 8], // Index
  [0, 9], [9, 10], [10, 11], [11, 12], // Middle
  [0, 13], [13, 14], [14, 15], [15, 16], // Ring
  [0, 17], [17, 18], [18, 19], [19, 20] // Pinky
];

// Thresholds

// 0.01 = 1% of screen movement (approx 10-20px) is considered "jitter/still".
// Increased to allow for more natural hand instability and tracking noise.
export const STILLNESS_THRESHOLD = 0.01; 
export const STILLNESS_DURATION_MS = 2000; 

// 0.06 = 6% of screen movement per frame is considered a "wave/shake".
// Triggers bird scaring.
export const SHAKE_THRESHOLD = 0.06; 

// 0.15 = 15% of screen movement per frame.
// Requires a vigorous, hard shake to clean the poop.
export const CLEAN_THRESHOLD = 0.15;

export const FIST_THRESHOLD = 0.1;