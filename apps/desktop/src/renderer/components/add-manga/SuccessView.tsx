interface SuccessViewProps {
  onClose: () => void;
}

export function SuccessView({ onClose }: SuccessViewProps) {
  return (
    <div className="add-manga-success">
      <div className="add-manga-success-icon">✓</div>
      <h4 className="add-manga-success-title">Manga Added!</h4>
      <p className="add-manga-success-text">
        Manga has been added to your library.
      </p>
      <button className="btn btn-primary" onClick={onClose}>
        Close
      </button>
    </div>
  );
}
