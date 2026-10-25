import { useState } from "react";
import { Button, MessageBar, MessageBarBody } from "@fluentui/react-components";
import { ItemPicker } from "@/components/mobile/ItemPicker";
import { ItemSummary } from "@/components/mobile/ItemSummary";
import { MobilePage } from "@/components/mobile/MobilePage";
import { QuantityStepper } from "@/components/mobile/QuantityStepper";
import { ResultPanel } from "@/components/mobile/ResultPanel";
import { usePickItems, type PickItem } from "@/hooks/UsePickItems";
import { errorText, useStockTransaction } from "@/utils/StockTransactions";
import { useStyles } from "@/styles/QuickTransaction.styles";

type Mode = "receive" | "pick";

const CONFIG = {
  receive: { title: "Receive stock", verb: "Receive", past: "Received", type: "inbound" },
  pick: { title: "Pick stock", verb: "Pick", past: "Picked", type: "outbound" },
} as const;

// Receive and Pick are the same flow in opposite directions: choose an item, set a quantity, confirm.
// The server keeps the item's quantity in step and refuses a pick of more than is on hand; the app
// never checks that itself, it shows the server's message.
function QuickTransactionFlow({ mode }: { mode: Mode }) {
  const styles = useStyles();
  const config = CONFIG[mode];
  const stock = useStockTransaction();
  // Refetched by the mutation once it succeeds, so the result shows the server's new quantity
  const { items } = usePickItems();
  const [item, setItem] = useState<PickItem | null>(null);
  const [quantity, setQuantity] = useState<number | null>(1);
  const [done, setDone] = useState(false);

  const restart = () => {
    setItem(null);
    setQuantity(1);
    setDone(false);
    stock.reset();
  };

  if (done && item && quantity !== null) {
    const onHand = items.find((candidate) => candidate.id === item.id)?.quantity;
    return (
      <MobilePage title={config.title}>
        <ResultPanel
          title={`${config.past} ${quantity}`}
          detail={onHand === undefined ? item.name : `${item.name} - ${onHand} on hand now`}
          onAgain={restart}
        />
      </MobilePage>
    );
  }

  if (!item) {
    return (
      <MobilePage title={config.title}>
        <ItemPicker onSelect={setItem} />
      </MobilePage>
    );
  }

  // The only check here is that a quantity is filled in
  const valid = quantity !== null && quantity >= 1;

  const confirm = async () => {
    if (!valid) return;
    try {
      await stock.mutateAsync({
        itemId: item.id,
        itemName: item.name,
        type: config.type,
        quantity,
        label: config.verb,
      });
      setDone(true);
    } catch {
      // Shown below from the mutation's error; the worker can adjust and try again
    }
  };

  return (
    <MobilePage
      title={config.title}
      footer={
        <Button
          className={styles.confirm}
          appearance="primary"
          size="large"
          disabled={!valid || stock.isPending}
          onClick={() => void confirm()}
          data-testid="flow-confirm"
        >
          {stock.isPending ? "Saving..." : valid ? `${config.verb} ${quantity}` : config.verb}
        </Button>
      }
    >
      <ItemSummary item={item} onChange={restart} />
      <QuantityStepper
        id="quick-quantity"
        label="Quantity"
        value={quantity}
        onChange={setQuantity}
        min={1}
        hint={quantity === null ? "Enter how many" : undefined}
      />
      {stock.error && (
        <MessageBar intent="error">
          <MessageBarBody>{errorText(stock.error)}</MessageBarBody>
        </MessageBar>
      )}
    </MobilePage>
  );
}

// Keyed by mode so switching between /receive and /pick never carries an item or quantity over
export default function QuickTransactionPage({ mode }: { mode: Mode }) {
  return <QuickTransactionFlow key={mode} mode={mode} />;
}
