import { useId, useState, type FormEvent } from 'react';
import { BottomSheet, Button, Input } from '@/components/ui';
import { MAX_DIAS, validarIntervalo, type Intervalo, type IntervaloErrors } from '../periodos';

type PeriodoSheetProps = {
  /** Intervalo exibido agora (valores iniciais dos campos). */
  inicial: Intervalo;
  /** `yyyy-MM-dd`, usado como `max` dos campos. */
  hoje: string;
  onAplicar: (intervalo: Intervalo) => void;
  onClose: () => void;
};

/** Seletor de período personalizado (duas datas nativas). Bloqueia início > fim e > 366 dias. */
export function PeriodoSheet({ inicial, hoje, onAplicar, onClose }: PeriodoSheetProps) {
  const formId = useId();
  const [de, setDe] = useState(inicial.de > hoje ? hoje : inicial.de);
  const [ate, setAte] = useState(inicial.ate > hoje ? hoje : inicial.ate);
  const [errors, setErrors] = useState<IntervaloErrors>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validarIntervalo({ de, ate });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onAplicar(result.intervalo);
  }

  return (
    <BottomSheet
      open
      title="Escolher período"
      onClose={onClose}
      footer={
        <Button type="submit" form={formId} fullWidth size="lg">
          Ver relatório
        </Button>
      }
    >
      <form id={formId} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Input
          label="De"
          name="de"
          type="date"
          max={hoje}
          value={de}
          onChange={(e) => setDe(e.target.value)}
          error={errors.de}
          required
        />
        <Input
          label="Até"
          name="ate"
          type="date"
          max={hoje}
          value={ate}
          onChange={(e) => setAte(e.target.value)}
          error={errors.ate}
          hint={`No máximo ${MAX_DIAS} dias.`}
          required
        />
      </form>
    </BottomSheet>
  );
}
