import { cn } from "@/lib/utils"
import { LoaderCircleIcon } from "lucide-react"

interface LoadingSpinnerProps {
  size?: "sm" | "default" | "lg"
  className?: string
}

const sizeClasses = {
  sm: "size-4",
  default: "size-6",
  lg: "size-8",
} as const

function LoadingSpinner({ size = "default", className }: LoadingSpinnerProps) {
  return (
    <LoaderCircleIcon
      data-slot="loading-spinner"
      className={cn("animate-spin text-muted-foreground", sizeClasses[size], className)}
    />
  )
}

export { LoadingSpinner }
