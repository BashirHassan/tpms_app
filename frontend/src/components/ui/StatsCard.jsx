import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent } from './Card';
import { cn } from '../../utils/helpers';

const cardVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0  },
};
const cardTransition = { duration: 0.4, ease: 'easeOut' };

const toneClasses = {
  blue:    'bg-blue-50 text-blue-600 ring-blue-100',
  green:   'bg-green-50 text-green-600 ring-green-100',
  amber:   'bg-amber-50 text-amber-600 ring-amber-100',
  yellow:  'bg-yellow-50 text-yellow-600 ring-yellow-100',
  orange:  'bg-orange-50 text-orange-600 ring-orange-100',
  red:     'bg-red-50 text-red-600 ring-red-100',
  purple:  'bg-purple-50 text-purple-600 ring-purple-100',
  teal:    'bg-teal-50 text-teal-600 ring-teal-100',
  primary: 'bg-primary-50 text-primary-600 ring-primary-100',
  gray:    'bg-gray-50 text-gray-600 ring-gray-100',
};

function StatsCard({
  title,
  label,
  value,
  icon: Icon,
  tone = 'blue',
  subValue,
  children,
  to,
  onClick,
  className,
  contentClassName,
  valueClassName,
  labelClassName,
  iconClassName,
  iconWrapperClassName,
  surface = 'card',
  index = 0,
  ...props
}) {
  const body = (
    <div className="relative overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'truncate text-[11px] font-medium uppercase tracking-wide text-gray-500 sm:text-xs',
              labelClassName
            )}
          >
            {label || title}
          </p>

          <p
            className={cn(
              'mt-1 truncate text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl',
              valueClassName
            )}
          >
            {value ?? 0}
          </p>

          {subValue ? (
            <p className="mt-1 truncate text-xs font-medium text-gray-500 sm:text-sm">
              {subValue}
            </p>
          ) : null}

          {children ? <div className="mt-2">{children}</div> : null}
        </div>

        {Icon && (
          <div
            className={cn(
              'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl m-0.5 ring-1 sm:h-12 sm:w-12',
              toneClasses[tone] || toneClasses.blue,
              iconWrapperClassName
            )}
          >
            <Icon className={cn('h-5 w-5 sm:h-6 sm:w-6', iconClassName)} />
          </div>
        )}
      </div>
    </div>
  );

  const interactiveClassName = cn(
    'group relative overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm',
    'transition-all duration-200 ease-out',
    (to || onClick) && 'hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-lg',
    onClick && 'cursor-pointer',
    className
  );

  const content =
    surface === 'panel' ? (
      <div
        className={cn(interactiveClassName, 'p-4 sm:p-5', contentClassName)}
        onClick={onClick}
        {...props}
      >
        {body}
      </div>
    ) : (
      <Card className={interactiveClassName} onClick={onClick} {...props}>
        <CardContent className={cn('p-4 sm:p-5', contentClassName)}>
          {body}
        </CardContent>
      </Card>
    );

  return (
    <motion.div
      variants={cardVariants}
      initial="initial"
      animate="animate"
      transition={{ ...cardTransition, delay: index * 0.05 }}
    >
      {to ? (
        <Link to={to} className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/30">
          {content}
        </Link>
      ) : content}
    </motion.div>
  );
}

function StatsGrid({ children, className, columns = 4 }) {
  const columnsClass = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4',
    5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
    6: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
  };

  return (
    <div
      className={cn(
        'grid gap-3 sm:gap-4',
        columnsClass[columns] || columnsClass[4],
        className
      )}
    >
      {children}
    </div>
  );
}

export { StatsCard, StatsGrid };
