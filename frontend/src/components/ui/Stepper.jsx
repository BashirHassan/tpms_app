/**
 * Stepper Component
 * A modern, reusable multi-step form component with mobile-first design
 */

import { cn } from '../../utils/helpers';
import { IconCheck } from '@tabler/icons-react';

/**
 * Stepper - Container component
 */
export function Stepper({ children, currentStep = 0, className }) {
  return (
    <div className={cn('w-full', className)}>
      <nav aria-label="Progress">
        <ol className="flex items-center w-full">
          {children}
        </ol>
      </nav>
    </div>
  );
}

/**
 * Step - Individual step item
 */
export function Step({ 
  step, 
  title, 
  description,
  status = 'upcoming', // 'complete' | 'current' | 'upcoming'
  isLast = false,
  onClick,
  disabled = false,
}) {
  const isComplete = status === 'complete';
  const isCurrent = status === 'current';
  const isClickable = onClick && !disabled && (isComplete || isCurrent);

  return (
    <li className={cn(
      'flex items-center',
      isLast ? 'flex-shrink-0' : 'flex-1'
    )}>
      {/* Step Button */}
      <button
        type="button"
        onClick={isClickable ? onClick : undefined}
        disabled={!isClickable}
        className={cn(
          'relative flex flex-col items-center group flex-shrink-0',
          isClickable && 'cursor-pointer',
          !isClickable && 'cursor-default'
        )}
      >
        {/* Step Circle - Responsive sizing */}
        <span
          className={cn(
            'relative z-10 flex items-center justify-center rounded-full border-2 transition-all duration-300',
            // Responsive sizing
            'w-8 h-8 md:w-10 md:h-10',
            // States
            isComplete && 'bg-primary-600 border-primary-600 shadow-md shadow-primary-200',
            isCurrent && 'border-primary-600 bg-white ring-4 ring-primary-50',
            !isComplete && !isCurrent && 'border-gray-300 bg-gray-50',
            // Hover effects
            isClickable && 'group-hover:scale-110 group-hover:shadow-lg',
            isComplete && isClickable && 'group-hover:shadow-primary-300',
          )}
        >
          {isComplete ? (
            <IconCheck className="w-4 h-4 md:w-5 md:h-5 text-white" strokeWidth={3} />
          ) : (
            <span
              className={cn(
                'text-xs md:text-sm font-bold',
                isCurrent ? 'text-primary-600' : 'text-gray-400'
              )}
            >
              {step}
            </span>
          )}
        </span>

        {/* Step Labels - Hidden on mobile, visible on larger screens */}
        <div className="hidden sm:flex flex-col items-center mt-2">
          <span
            className={cn(
              'text-xs md:text-sm font-semibold transition-colors whitespace-nowrap',
              isComplete && 'text-primary-600',
              isCurrent && 'text-primary-700',
              !isComplete && !isCurrent && 'text-gray-400'
            )}
          >
            {title}
          </span>
          {description && (
            <span className={cn(
              'mt-0.5 text-[10px] md:text-xs transition-colors whitespace-nowrap',
              isCurrent ? 'text-gray-500' : 'text-gray-400'
            )}>
              {description}
            </span>
          )}
        </div>

        {/* Mobile: Show title below current step only */}
        {isCurrent && (
          <span className="sm:hidden mt-1.5 text-[10px] font-semibold text-primary-600 whitespace-nowrap">
            {title}
          </span>
        )}
      </button>

      {/* Connector Line */}
      {!isLast && (
        <div className="flex-1 mx-2 md:mx-3">
          <div 
            className={cn(
              'h-0.5 md:h-1 rounded-full transition-all duration-500',
              isComplete 
                ? 'bg-gradient-to-r from-primary-500 to-primary-400' 
                : 'bg-gray-200'
            )}
          />
        </div>
      )}
    </li>
  );
}

/**
 * StepContent - Content wrapper for each step
 */
export function StepContent({ children, isActive, className }) {
  if (!isActive) return null;

  return (
    <div
      className={cn(
        'animate-in fade-in slide-in-from-right-4 duration-300',
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * StepActions - Footer actions for navigation
 */
export function StepActions({ children, className }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between pt-6 mt-6 border-t border-gray-200',
        className
      )}
    >
      {children}
    </div>
  );
}
