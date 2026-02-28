package com.sanskruti.cashflow.cashflow_backend.service;
import com.sanskruti.cashflow.cashflow_backend.api.dto.SummaryResponse;
import com.sanskruti.cashflow.cashflow_backend.api.dto.WeeklyPoint;
import com.sanskruti.cashflow.cashflow_backend.model.Transaction;
import com.sanskruti.cashflow.cashflow_backend.repository.TransactionRepository;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;


@Service
public class AnalyticsService {
    private final TransactionRepository transactionRepository;

    public AnalyticsService(TransactionRepository transactionRepository) {
        this.transactionRepository = transactionRepository;
    }

    private double r2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    public SummaryResponse computeSummary(Long datasetId) {
        List<Transaction> txs = transactionRepository.findByDatasetId(datasetId);

        double totalIncome = txs.stream()
                .filter(t -> "INCOME".equalsIgnoreCase(t.getType()))
                .mapToDouble(Transaction::getAmount)
                .sum();

        double totalExpenseAbs = txs.stream()
                .filter(t -> "EXPENSE".equalsIgnoreCase(t.getType()))
                .mapToDouble(t -> Math.abs(t.getAmount()))
                .sum();

        double net = totalIncome - totalExpenseAbs;

        List<WeeklyPoint> weekly = computeWeeklySeries(datasetId);

        double avgWeeklyNet = weekly.stream().mapToDouble(WeeklyPoint::net).average().orElse(0.0);
        double avgWeeklyExpense = weekly.stream().mapToDouble(WeeklyPoint::expense).average().orElse(0.0);

        return new SummaryResponse(
        datasetId,
        r2(totalIncome),
        r2(totalExpenseAbs),
        r2(net),
        r2(avgWeeklyNet),
        r2(avgWeeklyExpense)
);
    }

    public List<WeeklyPoint> computeWeeklySeries(Long datasetId) {
        List<Transaction> txs = transactionRepository.findByDatasetId(datasetId);

        // group by weekStart (Monday)
        Map<LocalDate, List<Transaction>> byWeek = txs.stream()
                .collect(Collectors.groupingBy(t -> weekStart(t.getDate())));

        List<LocalDate> weeks = new ArrayList<>(byWeek.keySet());
        Collections.sort(weeks);

        List<WeeklyPoint> points = new ArrayList<>();
        for (LocalDate ws : weeks) {
            List<Transaction> wtx = byWeek.get(ws);

            double income = wtx.stream()
                    .filter(t -> "INCOME".equalsIgnoreCase(t.getType()))
                    .mapToDouble(Transaction::getAmount).sum();

            double expense = wtx.stream()
                    .filter(t -> "EXPENSE".equalsIgnoreCase(t.getType()))
                    .mapToDouble(t -> Math.abs(t.getAmount())).sum();

            
            points.add(new WeeklyPoint(ws.toString(),r2(income),r2(expense),r2(income - expense)
));
        }
        return points;
    }

    private LocalDate weekStart(LocalDate date) {
        LocalDate d = date;
        while (d.getDayOfWeek() != DayOfWeek.MONDAY) {
            d = d.minusDays(1);
        }
        return d;
    }
    
}
