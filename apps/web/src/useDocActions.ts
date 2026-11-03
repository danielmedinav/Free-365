import { docPath, type DocKind } from '@free360/core';
import { useNavigate } from 'react-router';
import { useRepo } from './services';

/** Creating a document always navigates straight into its editor. */
export function useCreateDoc() {
  const repo = useRepo();
  const navigate = useNavigate();
  return async (kind: DocKind) => {
    const meta = await repo.create({ kind });
    navigate(docPath(meta));
  };
}
