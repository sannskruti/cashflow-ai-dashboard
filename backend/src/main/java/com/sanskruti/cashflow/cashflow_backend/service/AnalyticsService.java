package com.sanskruti.cashflow.cashflow_backend.service;
import com.sanskruti.cashflow.cashflow_backend.api.dto.SummaryResponse;
import com.sanskruti.cashflow.cashflow_backend.api.dto.WeeklyPoint;
import com.sanskruti.cashflow.cashflow_backend.model.Transaction;
import com.sanskruti.cashflow.cashflow_backend.repository.TransactionRepository;
import org.springframework.stereotype.Service;


import com.sanskruti.cashflow.cashflow_backend.api.dto.DriverPoint;
import com.sanskruti.cashflow.cashflow_backend.api.dto.RiskResponse;
import java.util.stream.Collectors;



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

    public List<DriverPoint> topExpenseDrivers(Long datasetId, int limit) {
    List<Transaction> txs = transactionRepository.findByDatasetId(datasetId);

    return txs.stream()
            .filter(t -> "EXPENSE".equalsIgnoreCase(t.getType()))
            .collect(Collectors.groupingBy(
                    t -> (t.getCategory() == null || t.getCategory().isBlank()) ? "uncategorized" : t.getCategory(),
                    Collectors.summingDouble(t -> Math.abs(t.getAmount()))
            ))
            .entrySet().stream()
            .sorted((a, b) -> Double.compare(b.getValue(), a.getValue()))
            .limit(limit)
            .map(e -> new DriverPoint(e.getKey(), r2(e.getValue())))
            .toList();
}

public RiskResponse risk(Long datasetId) {
    List<WeeklyPoint> weekly = computeWeeklySeries(datasetId);
    if (weekly.isEmpty()) {
        return new RiskResponse(datasetId, 0, 0, 0, List.of("No data"), List.of());
    }

    List<Double> nets = weekly.stream().map(WeeklyPoint::net).toList();

    long negativeWeeks = nets.stream().filter(n -> n < 0).count();
    double negativeRatio = (double) negativeWeeks / nets.size();

    double mean = nets.stream().mapToDouble(Double::doubleValue).average().orElse(0);
    double variance = nets.stream().mapToDouble(n -> (n - mean) * (n - mean)).average().orElse(0);
    double std = Math.sqrt(variance);

    // Simple score components
    int score = 0;
    score += (int) Math.round(negativeRatio * 60);                 // up to 60
    score += (int) Math.min(40, Math.round((std / (Math.abs(mean) + 1)) * 40)); // up to 40
    score = Math.max(0, Math.min(100, score));

    List<String> reasons = new java.util.ArrayList<>();
    if (negativeRatio > 0.4) reasons.add("High fraction of weeks with negative net cashflow");
    if (std > Math.abs(mean) * 1.2) reasons.add("High volatility in weekly net cashflow");
    if (reasons.isEmpty()) reasons.add("Stable cashflow pattern");

    return new RiskResponse(
            datasetId,
            score,
            r2(negativeRatio),
            r2(std),
            reasons,
            topExpenseDrivers(datasetId, 5)
    );
}
    
}
