import { Badge, Link, SkeletonLine, Table, Text } from "@cloudflare/kumo";

/** One entry that shows a reference to this one. */
export interface UsedByRow {
  /** A stable key (holder id and field path). */
  id: string;
  title: string;
  href?: string | undefined;
  /** "Events · English · Venue": where the value sits, worded by the host. */
  detail: string;
  status: "draft" | "review" | "published" | "archived";
  /** The holder's translations that show its value too, worded: "Also shown in Turkish". */
  shownBy?: string | undefined;
  /** In the delete dialog: what the delete does to this entry ("Will show nothing for this field"). */
  note?: string | undefined;
}

/** Every word of the block (no English fallback). */
export interface UsedByListLabels {
  /** Column headers. */
  entry: string;
  status: string;
  statuses: Record<UsedByRow["status"], string>;
  /** The table's accessible caption: "Entries that reference this entry". */
  caption: string;
}

export interface UsedByListProps {
  rows: readonly UsedByRow[];
  loading?: boolean;
  labels: UsedByListLabels;
}

const STATUS_BADGE = {
  draft: "secondary",
  review: "warning",
  published: "success",
  archived: "outline",
} as const;

/**
 * The entries that reference this one (RFC-0045 §5): the entry editor's "Used by" card and the
 * delete dialog's referrers. A Kumo `Table` of two columns, so it fits a phone: the entry (its
 * title linked to its editor, where the value sits, the translations that show it too, and a
 * note), and its status as a `Badge`. Published referrers come first from the server. Goes in a
 * flush `SectionCard`.
 */
export function UsedByList({ rows, loading = false, labels }: UsedByListProps) {
  return (
    <Table data-used-by="">
      <caption className="sr-only">{labels.caption}</caption>
      <Table.Header>
        <Table.Row>
          <Table.Head className="text-start">{labels.entry}</Table.Head>
          <Table.Head className="w-0 text-start whitespace-nowrap">{labels.status}</Table.Head>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {loading
          ? [0, 1, 2].map((r) => (
              <Table.Row key={r} aria-hidden>
                <Table.Cell>
                  <SkeletonLine minWidth={80} maxWidth={200} />
                </Table.Cell>
                <Table.Cell>
                  <SkeletonLine minWidth={40} maxWidth={60} />
                </Table.Cell>
              </Table.Row>
            ))
          : rows.map((row) => (
              <Table.Row key={row.id} data-used-by-row={row.id} data-status={row.status}>
                <Table.Cell className="min-w-0">
                  <div className="grid min-w-0 gap-0.5">
                    {row.href ? (
                      <Link href={row.href} className="min-w-0 break-words">
                        {row.title}
                      </Link>
                    ) : (
                      <Text as="span">{row.title}</Text>
                    )}
                    <Text as="span" variant="secondary" size="sm">
                      {row.detail}
                    </Text>
                    {row.shownBy && (
                      <Text as="span" variant="secondary" size="sm">
                        {row.shownBy}
                      </Text>
                    )}
                    {row.note && (
                      <Text as="span" variant="secondary" size="sm">
                        {row.note}
                      </Text>
                    )}
                  </div>
                </Table.Cell>
                <Table.Cell className="whitespace-nowrap align-top">
                  <Badge variant={STATUS_BADGE[row.status]}>{labels.statuses[row.status]}</Badge>
                </Table.Cell>
              </Table.Row>
            ))}
      </Table.Body>
    </Table>
  );
}
