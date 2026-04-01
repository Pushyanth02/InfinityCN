import type { HTMLMotionProps } from 'framer-motion';
import { motion } from 'framer-motion';

interface CardProps extends HTMLMotionProps<'div'> {
  hoverable?: boolean;
}

export function Card({
  className = '',
  hoverable = false,
  children,
  ...props
}: CardProps) {
  return (
    <motion.div
      className={`card ${hoverable ? 'card-hover' : ''} ${className}`}
      {...props}
    >
      {children}
    </motion.div>
  );
}
