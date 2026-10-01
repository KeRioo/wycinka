import { motion } from 'framer-motion';
import { TreePine } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FabProps {
  onClick: () => void;
  label?: string;
  className?: string;
}

export default function Fab({
  onClick,
  label = 'Dodaj drzewo',
  className,
}: FabProps): JSX.Element {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      data-testid="fab-add-tree"
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      whileTap={{ scale: 0.95 }}
      className={cn(
        'fixed bottom-6 right-6 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-forest-700 text-white shadow-lg transition-colors hover:bg-forest-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-500 focus-visible:ring-offset-2',
        className,
      )}
    >
      <span className="absolute inset-0 animate-ping rounded-full bg-forest-700 opacity-20" aria-hidden="true" />
      <TreePine aria-hidden="true" className="relative h-6 w-6" />
      <span className="sr-only">{label}</span>
    </motion.button>
  );
}
