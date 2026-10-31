"use client";

import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { FilePicker } from "@/components/ui/file-picker";
import { imageFileError, SURVEY_IMAGE_TYPES } from "../images";
import type { DraftQuestion } from "./model";

export function DraftImagePreview({
  image,
}: {
  image: NonNullable<DraftQuestion["image"]>;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const url = URL.createObjectURL(image.file);
    if (imageRef.current) imageRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [image.file]);
  // Archivo local: no pasa por el optimizador de Next ni se recorta el estímulo.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imageRef}
      alt={image.alt || "Imagen para evaluar"}
      className="max-h-96 w-full rounded-md object-contain"
    />
  );
}

export function QuestionImageEditor({
  image,
  onChange,
}: {
  image?: DraftQuestion["image"];
  onChange: (image: DraftQuestion["image"]) => void;
}) {
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <p className="text-sm font-medium text-heading">
        Imagen de la pregunta (opcional)
      </p>
      <p className="text-xs text-muted">
        Se muestra antes de las respuestas. PNG, JPEG o WebP, hasta 10 MB.
      </p>
      {image ? <DraftImagePreview image={image} /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <FilePicker
          key={image ? image.file.name + image.file.lastModified : "empty"}
          label={image ? "Cambiar imagen" : "Agregar imagen"}
          accept={SURVEY_IMAGE_TYPES.join(",")}
          onFiles={([file]) => {
            if (!file) return;
            const problem = imageFileError(file);
            setError(problem);
            if (!problem) onChange({ file, alt: image?.alt ?? "" });
          }}
          onChange={(e) => {
            e.target.value = "";
          }}
        />
        {image ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onChange(undefined);
              setError(undefined);
            }}
          >
            Quitar imagen
          </Button>
        ) : null}
      </div>
      {image ? (
        <Field
          label="Descripción de la imagen"
          hint="Opcional. Ayuda a quienes usan un lector de pantalla; evita sugerir una respuesta."
        >
          <Input
            value={image.alt}
            maxLength={300}
            onChange={(e) => onChange({ ...image, alt: e.target.value })}
          />
        </Field>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}
