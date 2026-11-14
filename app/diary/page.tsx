'use client'
import { Suspense } from 'react'
import JournalView from '@/components/growth/JournalView'
export default function DiaryPage() { return <Suspense fallback={null}><JournalView kind="diary" /></Suspense> }
