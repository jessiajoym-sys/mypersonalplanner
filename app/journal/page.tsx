'use client'
import { Suspense } from 'react'
import JournalView from '@/components/growth/JournalView'
export default function JournalPage() { return <Suspense fallback={null}><JournalView kind="journal" /></Suspense> }
