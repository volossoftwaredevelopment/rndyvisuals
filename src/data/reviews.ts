// Mock client testimonials for the reviews carousel.

export interface Review {
  quote: string
  name: string
  role: string
  rating: number
}

export const REVIEWS: Review[] = [
  {
    quote: 'They turned three days on the water into two minutes that gave me chills. Every frame felt intentional.',
    name: 'Marco V.',
    role: 'Yacht owner',
    rating: 5,
  },
  {
    quote: 'Fast, calm and completely on top of it. The edit landed a week early and beat the brief.',
    name: 'Elena R.',
    role: 'Event producer',
    rating: 5,
  },
  {
    quote: "We've worked with a lot of crews. None made the boat look like this. Worth every cent.",
    name: 'Andreas K.',
    role: 'Charter manager',
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
    role: 'Regatta organiser',
    rating: 5,
  },
]
