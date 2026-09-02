import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Box } from "@mui/material";
import TanqueCard from "./TanqueCard";

/**
 * Envuelve TanqueCard con soporte de drag & drop (dnd-kit).
 * Muestra un handle visual de 6 puntos en la esquina superior derecha.
 */
function SortableTanqueCard({ id, tanque }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
    zIndex: isDragging ? 999 : "auto",
    position: "relative",
    width: "100%",
  };

  return (
    <Box ref={setNodeRef} style={style}>
      {/* Handle de arrastre – 6 puntos en esquina superior derecha */}
      <Box
        {...attributes}
        {...listeners}
        sx={{
          position: "absolute",
          top: 10,
          right: 10,
          zIndex: 10,
          cursor: isDragging ? "grabbing" : "grab",
          display: "grid",
          gridTemplateColumns: "repeat(2, 6px)",
          gap: "3px",
          p: "6px",
          borderRadius: "6px",
          bgcolor: "rgba(15, 42, 85, 0.06)",
          "&:hover": { bgcolor: "rgba(15, 42, 85, 0.13)" },
          transition: "background 0.15s",
          touchAction: "none",
        }}
        title="Arrastra para mover"
      >
        {[...Array(6)].map((_, i) => (
          <Box
            key={i}
            sx={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              bgcolor: isDragging ? "#1565C0" : "#94A3B8",
            }}
          />
        ))}
      </Box>

      <TanqueCard tanque={tanque} />
    </Box>
  );
}

export default SortableTanqueCard;
