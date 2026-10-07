import { SkeletonLine, Table } from "@cloudhal/ui";

/** Loading rows for a table (DESIGN.md §5: never a spinner-only page). */
export function TableSkeleton({ columns, rows = 4 }: { columns: number; rows?: number }) {
  return (
    <Table.Body>
      {Array.from({ length: rows }, (_, r) => (
        <Table.Row key={r}>
          {Array.from({ length: columns }, (_, c) => (
            <Table.Cell key={c}>
              <SkeletonLine minWidth={40} maxWidth={90} />
            </Table.Cell>
          ))}
        </Table.Row>
      ))}
    </Table.Body>
  );
}
