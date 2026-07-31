// Placeholder client testimonials for the reviews carousel — replace with real,
// permissioned quotes when available. Kept genre-neutral (no sea/yacht references)
// to match the general video-production positioning.

export interface Review {
  quote: string
  name: string
  role: string
  rating: number
}

export const REVIEWS: Review[] = [
  {
    quote: 'They turned a three-day shoot into two minutes that gave me chills. Every frame felt intentional.',
    name: 'Marco V.',
    role: 'Creative director',
    rating: 5,
  },
  {
    quote: 'Fast, calm and completely on top of it. The edit landed a week early and beat the brief.',
    name: 'Elena R.',
    role: 'Event producer',
    rating: 5,
  },
  {
    quote: "We've worked with a lot of crews. None made our product look like this. Worth every cent.",
    name: 'Andreas K.',
    role: 'Marketing lead',
    rating: 5,
  },
  {
    quote: 'The colour work alone sold the campaign. People kept asking what it was shot on — it was the grade.',
    name: 'Sofia L.',
    role: 'Brand lead',
    rating: 5,
  },
  {
    quote: 'Small crew, huge result. They read the light and just knew where to be.',
    name: 'Dmitry P.',
    role: 'Festival producer',
    rating: 5,
  },
]
