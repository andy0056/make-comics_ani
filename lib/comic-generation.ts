import { NextResponse } from 'next/server'
import { freeTierRateLimit } from '@/lib/rate-limit'
import { apiError } from '@/lib/api-route'

const PRIMARY_GEMINI_IMAGE_MODEL = 'google/gemini-3-pro-image'

function normalizeModel(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const configuredPrimaryModel =
  normalizeModel(process.env.TOGETHER_IMAGE_MODEL) ??
  PRIMARY_GEMINI_IMAGE_MODEL

const useGeminiImageDimensions = configuredPrimaryModel === PRIMARY_GEMINI_IMAGE_MODEL

export const IMAGE_MODEL = configuredPrimaryModel

export const IMAGE_DIMENSIONS = useGeminiImageDimensions
  ? { width: 896, height: 1200 }
  : { width: 864, height: 1184 }

type ApiKeyResolutionSuccess = {
  apiKey: string
  usesOwnApiKey: boolean
}

type ApiKeyResolutionFailure = {
  response: NextResponse
}

const PLACEHOLDER_PATTERN = /(dummy|your_|example|changeme|replace)/i

function normalizeApiKey(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function isLikelyPlaceholderApiKey(value: string | undefined): boolean {
  if (!value) {
    return true
  }

  return PLACEHOLDER_PATTERN.test(value)
}

export function hasUsableServerTogetherApiKey(): boolean {
  const key = normalizeApiKey(process.env.TOGETHER_API_KEY)
  return !!key && !isLikelyPlaceholderApiKey(key)
}

export async function resolveTogetherApiKey({
  userId,
  bodyApiKey,
  headerApiKey,
  requestId,
}: {
  userId: string
  bodyApiKey?: unknown
  headerApiKey?: string | null
  requestId: string
}): Promise<ApiKeyResolutionSuccess | ApiKeyResolutionFailure> {
  const byokApiKey = normalizeApiKey(bodyApiKey) ?? normalizeApiKey(headerApiKey)

  if (byokApiKey) {
    return { apiKey: byokApiKey, usesOwnApiKey: true }
  }

  if (!hasUsableServerTogetherApiKey()) {
    return {
      response: apiError({
        status: 400,
        error:
          'No valid server Together API key configured. Add your Together API key in the API Key modal.',
        requestId,
      }),
    }
  }

  const rateLimitResult = await freeTierRateLimit.limit(userId)
  if (!rateLimitResult.success) {
    return {
      response: NextResponse.json(
        {
          error:
            'Free tier limit reached. You get 3 generations every 7 days. Add your own API key for unlimited usage.',
          isRateLimited: true,
          creditsRemaining: rateLimitResult.remaining,
          resetTime: rateLimitResult.reset,
          requestId,
        },
        {
          status: 429,
          headers: { 'x-request-id': requestId },
        },
      ),
    }
  }

  return {
    apiKey: process.env.TOGETHER_API_KEY!,
    usesOwnApiKey: false,
  }
}

export function getGeneratedImageUrl(response: {
  data?: Array<{ url?: string | null } | null> | null
}): string | null {
  const imageUrl = response.data?.[0]?.url
  if (!imageUrl || typeof imageUrl !== 'string') {
    return null
  }

  return imageUrl
}
