package com.sanskruti.cashflow.cashflow_backend.repository;
import com.sanskruti.cashflow.cashflow_backend.model.Transaction;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
public interface TransactionRepository extends JpaRepository<Transaction, Long> {

    List<Transaction> findByDatasetId(Long datasetId);

    @Query(
            value = """
                SELECT t.*
                FROM transaction t
                WHERE t.dataset_id = :datasetId
                  AND (:type IS NULL OR t.type = :type)
                  AND (:category IS NULL OR CAST(COALESCE(t.category, '') AS TEXT) ILIKE :categoryLike)
                  AND (
                    :search IS NULL OR
                    CAST(COALESCE(t.description, '') AS TEXT) ILIKE :searchLike OR
                    CAST(COALESCE(t.category, '') AS TEXT) ILIKE :searchLike
                  )
                ORDER BY t.date DESC, t.id DESC
            """,
            countQuery = """
                SELECT COUNT(*)
                FROM transaction t
                WHERE t.dataset_id = :datasetId
                  AND (:type IS NULL OR t.type = :type)
                  AND (:category IS NULL OR CAST(COALESCE(t.category, '') AS TEXT) ILIKE :categoryLike)
                  AND (
                    :search IS NULL OR
                    CAST(COALESCE(t.description, '') AS TEXT) ILIKE :searchLike OR
                    CAST(COALESCE(t.category, '') AS TEXT) ILIKE :searchLike
                  )
            """,
            nativeQuery = true
    )
    Page<Transaction> searchDatasetTransactions(
            @Param("datasetId") Long datasetId,
            @Param("search") String search,
            @Param("searchLike") String searchLike,
            @Param("type") String type,
            @Param("category") String category,
            @Param("categoryLike") String categoryLike,
            Pageable pageable
    );

    @Query("""
        SELECT DISTINCT t.category
        FROM Transaction t
        WHERE t.dataset.id = :datasetId
          AND t.category IS NOT NULL
          AND t.category <> ''
        ORDER BY t.category ASC
    """)
    List<String> findDistinctCategoriesByDatasetId(@Param("datasetId") Long datasetId);
}
