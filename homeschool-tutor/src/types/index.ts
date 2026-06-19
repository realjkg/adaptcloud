export type GradeStage = 'K-2' | '3-5' | '6-8'

export type Subject =
  | 'morning_time'
  | 'living_books'
  | 'mathematics'
  | 'nature_study'
  | 'history'
  | 'language_arts'
  | 'science'
  | 'art_music'
  | 'saints'
  | 'free_study'

export interface SessionConfig {
  student_name: string
  grade: string
  grade_stage: GradeStage
  subjects: Subject[]
  lesson_focus?: string
  faith_emphasis?: string
  current_unit?: string
  voice_required?: boolean  // false for mute students — PIN-only auth, no voice passphrase
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamChunk {
  type: 'text' | 'tool' | 'done'
  content?: string
  tool?: string
}

export interface SubjectInfo {
  id: Subject
  label: string
  icon: string
  durationMin: number
  color: string
  description: string
}

export const SUBJECTS: SubjectInfo[] = [
  {
    id: 'morning_time',
    label: 'Morning Time',
    icon: '☀️',
    durationMin: 20,
    color: 'bg-amber-50 border-amber-200 text-amber-800',
    description: 'Bible, hymn, poetry & prayer',
  },
  {
    id: 'living_books',
    label: 'Living Books',
    icon: '📚',
    durationMin: 25,
    color: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    description: 'Charlotte Mason literature & narration',
  },
  {
    id: 'mathematics',
    label: 'Mathematics',
    icon: '🔢',
    durationMin: 20,
    color: 'bg-blue-50 border-blue-200 text-blue-800',
    description: 'Discovery-based mathematical thinking',
  },
  {
    id: 'nature_study',
    label: 'Nature Study',
    icon: '🌿',
    durationMin: 20,
    color: 'bg-green-50 border-green-200 text-green-800',
    description: 'Observation, wonder & creation',
  },
  {
    id: 'history',
    label: 'History & Geography',
    icon: '🗺️',
    durationMin: 20,
    color: 'bg-orange-50 border-orange-200 text-orange-800',
    description: 'Story-based history & real places',
  },
  {
    id: 'language_arts',
    label: 'Language Arts',
    icon: '✏️',
    durationMin: 15,
    color: 'bg-purple-50 border-purple-200 text-purple-800',
    description: 'Narration, copywork & grammar',
  },
  {
    id: 'science',
    label: 'Science',
    icon: '🔬',
    durationMin: 20,
    color: 'bg-teal-50 border-teal-200 text-teal-800',
    description: 'Botany, zoology & earth science',
  },
  {
    id: 'art_music',
    label: 'Art & Music',
    icon: '🎨',
    durationMin: 15,
    color: 'bg-rose-50 border-rose-200 text-rose-800',
    description: 'Composer & artist study',
  },
  {
    id: 'saints',
    label: 'Saints & Catechism',
    icon: '✝️',
    durationMin: 15,
    color: 'bg-faith-50 border-faith-200 text-faith-700',
    description: 'Saints, catechism & virtue formation',
  },
  {
    id: 'free_study',
    label: 'Free Study',
    icon: '🌟',
    durationMin: 20,
    color: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    description: 'Student-directed exploration',
  },
]

export const SUBJECT_MAP: Record<Subject, SubjectInfo> = Object.fromEntries(
  SUBJECTS.map((s) => [s.id, s])
) as Record<Subject, SubjectInfo>
