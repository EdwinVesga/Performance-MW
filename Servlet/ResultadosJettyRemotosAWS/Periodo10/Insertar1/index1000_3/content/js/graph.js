/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 0 : 0;
        var yOffset = options.yaxis.mode === "time" ? 0 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 69.0, "minX": 0.0, "maxY": 2587.0, "series": [{"data": [[0.0, 69.0], [0.1, 70.0], [0.2, 71.0], [0.3, 71.0], [0.4, 73.0], [0.5, 73.0], [0.6, 73.0], [0.7, 74.0], [0.8, 76.0], [0.9, 77.0], [1.0, 77.0], [1.1, 77.0], [1.2, 78.0], [1.3, 78.0], [1.4, 79.0], [1.5, 79.0], [1.6, 79.0], [1.7, 80.0], [1.8, 81.0], [1.9, 81.0], [2.0, 81.0], [2.1, 83.0], [2.2, 83.0], [2.3, 83.0], [2.4, 84.0], [2.5, 84.0], [2.6, 84.0], [2.7, 85.0], [2.8, 85.0], [2.9, 85.0], [3.0, 86.0], [3.1, 86.0], [3.2, 86.0], [3.3, 86.0], [3.4, 87.0], [3.5, 87.0], [3.6, 87.0], [3.7, 87.0], [3.8, 88.0], [3.9, 88.0], [4.0, 88.0], [4.1, 89.0], [4.2, 89.0], [4.3, 89.0], [4.4, 89.0], [4.5, 90.0], [4.6, 91.0], [4.7, 91.0], [4.8, 91.0], [4.9, 91.0], [5.0, 92.0], [5.1, 92.0], [5.2, 93.0], [5.3, 94.0], [5.4, 95.0], [5.5, 95.0], [5.6, 95.0], [5.7, 96.0], [5.8, 96.0], [5.9, 97.0], [6.0, 99.0], [6.1, 100.0], [6.2, 102.0], [6.3, 102.0], [6.4, 109.0], [6.5, 109.0], [6.6, 111.0], [6.7, 111.0], [6.8, 113.0], [6.9, 114.0], [7.0, 114.0], [7.1, 121.0], [7.2, 122.0], [7.3, 123.0], [7.4, 123.0], [7.5, 128.0], [7.6, 129.0], [7.7, 132.0], [7.8, 132.0], [7.9, 133.0], [8.0, 134.0], [8.1, 135.0], [8.2, 135.0], [8.3, 135.0], [8.4, 135.0], [8.5, 137.0], [8.6, 140.0], [8.7, 143.0], [8.8, 147.0], [8.9, 164.0], [9.0, 165.0], [9.1, 167.0], [9.2, 169.0], [9.3, 178.0], [9.4, 180.0], [9.5, 184.0], [9.6, 186.0], [9.7, 188.0], [9.8, 188.0], [9.9, 192.0], [10.0, 194.0], [10.1, 194.0], [10.2, 199.0], [10.3, 201.0], [10.4, 212.0], [10.5, 227.0], [10.6, 248.0], [10.7, 249.0], [10.8, 250.0], [10.9, 255.0], [11.0, 272.0], [11.1, 276.0], [11.2, 279.0], [11.3, 283.0], [11.4, 284.0], [11.5, 313.0], [11.6, 381.0], [11.7, 387.0], [11.8, 387.0], [11.9, 397.0], [12.0, 400.0], [12.1, 400.0], [12.2, 403.0], [12.3, 440.0], [12.4, 446.0], [12.5, 448.0], [12.6, 452.0], [12.7, 460.0], [12.8, 461.0], [12.9, 463.0], [13.0, 468.0], [13.1, 475.0], [13.2, 477.0], [13.3, 481.0], [13.4, 481.0], [13.5, 488.0], [13.6, 492.0], [13.7, 496.0], [13.8, 497.0], [13.9, 499.0], [14.0, 504.0], [14.1, 506.0], [14.2, 506.0], [14.3, 509.0], [14.4, 511.0], [14.5, 518.0], [14.6, 519.0], [14.7, 519.0], [14.8, 521.0], [14.9, 521.0], [15.0, 524.0], [15.1, 527.0], [15.2, 530.0], [15.3, 535.0], [15.4, 538.0], [15.5, 541.0], [15.6, 542.0], [15.7, 543.0], [15.8, 545.0], [15.9, 545.0], [16.0, 549.0], [16.1, 550.0], [16.2, 553.0], [16.3, 553.0], [16.4, 555.0], [16.5, 556.0], [16.6, 560.0], [16.7, 560.0], [16.8, 562.0], [16.9, 563.0], [17.0, 563.0], [17.1, 570.0], [17.2, 571.0], [17.3, 571.0], [17.4, 576.0], [17.5, 576.0], [17.6, 581.0], [17.7, 582.0], [17.8, 587.0], [17.9, 588.0], [18.0, 588.0], [18.1, 589.0], [18.2, 591.0], [18.3, 593.0], [18.4, 593.0], [18.5, 596.0], [18.6, 596.0], [18.7, 601.0], [18.8, 605.0], [18.9, 606.0], [19.0, 606.0], [19.1, 607.0], [19.2, 608.0], [19.3, 610.0], [19.4, 612.0], [19.5, 612.0], [19.6, 614.0], [19.7, 614.0], [19.8, 614.0], [19.9, 615.0], [20.0, 616.0], [20.1, 617.0], [20.2, 618.0], [20.3, 619.0], [20.4, 619.0], [20.5, 621.0], [20.6, 624.0], [20.7, 626.0], [20.8, 626.0], [20.9, 627.0], [21.0, 628.0], [21.1, 629.0], [21.2, 629.0], [21.3, 630.0], [21.4, 631.0], [21.5, 631.0], [21.6, 634.0], [21.7, 635.0], [21.8, 636.0], [21.9, 636.0], [22.0, 638.0], [22.1, 639.0], [22.2, 639.0], [22.3, 640.0], [22.4, 643.0], [22.5, 644.0], [22.6, 646.0], [22.7, 650.0], [22.8, 650.0], [22.9, 652.0], [23.0, 653.0], [23.1, 653.0], [23.2, 654.0], [23.3, 656.0], [23.4, 656.0], [23.5, 656.0], [23.6, 659.0], [23.7, 659.0], [23.8, 662.0], [23.9, 662.0], [24.0, 667.0], [24.1, 667.0], [24.2, 668.0], [24.3, 670.0], [24.4, 670.0], [24.5, 672.0], [24.6, 672.0], [24.7, 674.0], [24.8, 675.0], [24.9, 676.0], [25.0, 677.0], [25.1, 678.0], [25.2, 682.0], [25.3, 689.0], [25.4, 690.0], [25.5, 701.0], [25.6, 702.0], [25.7, 704.0], [25.8, 704.0], [25.9, 707.0], [26.0, 707.0], [26.1, 711.0], [26.2, 711.0], [26.3, 716.0], [26.4, 716.0], [26.5, 717.0], [26.6, 718.0], [26.7, 718.0], [26.8, 719.0], [26.9, 720.0], [27.0, 722.0], [27.1, 726.0], [27.2, 726.0], [27.3, 728.0], [27.4, 729.0], [27.5, 730.0], [27.6, 731.0], [27.7, 731.0], [27.8, 733.0], [27.9, 734.0], [28.0, 735.0], [28.1, 736.0], [28.2, 738.0], [28.3, 738.0], [28.4, 738.0], [28.5, 740.0], [28.6, 740.0], [28.7, 742.0], [28.8, 743.0], [28.9, 743.0], [29.0, 743.0], [29.1, 745.0], [29.2, 745.0], [29.3, 748.0], [29.4, 748.0], [29.5, 750.0], [29.6, 754.0], [29.7, 756.0], [29.8, 759.0], [29.9, 760.0], [30.0, 760.0], [30.1, 766.0], [30.2, 766.0], [30.3, 769.0], [30.4, 770.0], [30.5, 770.0], [30.6, 775.0], [30.7, 775.0], [30.8, 776.0], [30.9, 777.0], [31.0, 777.0], [31.1, 779.0], [31.2, 783.0], [31.3, 784.0], [31.4, 784.0], [31.5, 784.0], [31.6, 785.0], [31.7, 787.0], [31.8, 788.0], [31.9, 789.0], [32.0, 789.0], [32.1, 790.0], [32.2, 791.0], [32.3, 793.0], [32.4, 799.0], [32.5, 801.0], [32.6, 803.0], [32.7, 803.0], [32.8, 804.0], [32.9, 805.0], [33.0, 806.0], [33.1, 808.0], [33.2, 809.0], [33.3, 810.0], [33.4, 810.0], [33.5, 813.0], [33.6, 813.0], [33.7, 817.0], [33.8, 822.0], [33.9, 823.0], [34.0, 823.0], [34.1, 827.0], [34.2, 827.0], [34.3, 830.0], [34.4, 830.0], [34.5, 831.0], [34.6, 833.0], [34.7, 833.0], [34.8, 833.0], [34.9, 833.0], [35.0, 835.0], [35.1, 836.0], [35.2, 838.0], [35.3, 838.0], [35.4, 839.0], [35.5, 839.0], [35.6, 843.0], [35.7, 844.0], [35.8, 845.0], [35.9, 847.0], [36.0, 848.0], [36.1, 848.0], [36.2, 851.0], [36.3, 852.0], [36.4, 852.0], [36.5, 853.0], [36.6, 853.0], [36.7, 854.0], [36.8, 854.0], [36.9, 854.0], [37.0, 855.0], [37.1, 855.0], [37.2, 856.0], [37.3, 860.0], [37.4, 862.0], [37.5, 865.0], [37.6, 866.0], [37.7, 867.0], [37.8, 867.0], [37.9, 867.0], [38.0, 870.0], [38.1, 871.0], [38.2, 873.0], [38.3, 874.0], [38.4, 874.0], [38.5, 875.0], [38.6, 875.0], [38.7, 876.0], [38.8, 878.0], [38.9, 879.0], [39.0, 880.0], [39.1, 880.0], [39.2, 881.0], [39.3, 884.0], [39.4, 885.0], [39.5, 885.0], [39.6, 885.0], [39.7, 886.0], [39.8, 888.0], [39.9, 888.0], [40.0, 888.0], [40.1, 891.0], [40.2, 893.0], [40.3, 894.0], [40.4, 895.0], [40.5, 898.0], [40.6, 900.0], [40.7, 900.0], [40.8, 902.0], [40.9, 903.0], [41.0, 904.0], [41.1, 905.0], [41.2, 909.0], [41.3, 909.0], [41.4, 909.0], [41.5, 910.0], [41.6, 910.0], [41.7, 912.0], [41.8, 913.0], [41.9, 914.0], [42.0, 914.0], [42.1, 914.0], [42.2, 914.0], [42.3, 915.0], [42.4, 916.0], [42.5, 917.0], [42.6, 921.0], [42.7, 925.0], [42.8, 926.0], [42.9, 926.0], [43.0, 927.0], [43.1, 928.0], [43.2, 930.0], [43.3, 930.0], [43.4, 931.0], [43.5, 932.0], [43.6, 932.0], [43.7, 932.0], [43.8, 932.0], [43.9, 934.0], [44.0, 935.0], [44.1, 935.0], [44.2, 937.0], [44.3, 939.0], [44.4, 939.0], [44.5, 940.0], [44.6, 940.0], [44.7, 941.0], [44.8, 942.0], [44.9, 942.0], [45.0, 943.0], [45.1, 945.0], [45.2, 945.0], [45.3, 946.0], [45.4, 948.0], [45.5, 949.0], [45.6, 950.0], [45.7, 950.0], [45.8, 951.0], [45.9, 951.0], [46.0, 952.0], [46.1, 953.0], [46.2, 954.0], [46.3, 955.0], [46.4, 955.0], [46.5, 955.0], [46.6, 956.0], [46.7, 956.0], [46.8, 957.0], [46.9, 959.0], [47.0, 959.0], [47.1, 960.0], [47.2, 960.0], [47.3, 961.0], [47.4, 963.0], [47.5, 963.0], [47.6, 964.0], [47.7, 964.0], [47.8, 966.0], [47.9, 967.0], [48.0, 971.0], [48.1, 971.0], [48.2, 971.0], [48.3, 974.0], [48.4, 974.0], [48.5, 977.0], [48.6, 977.0], [48.7, 977.0], [48.8, 977.0], [48.9, 978.0], [49.0, 978.0], [49.1, 979.0], [49.2, 982.0], [49.3, 982.0], [49.4, 983.0], [49.5, 983.0], [49.6, 985.0], [49.7, 985.0], [49.8, 986.0], [49.9, 987.0], [50.0, 988.0], [50.1, 990.0], [50.2, 990.0], [50.3, 991.0], [50.4, 992.0], [50.5, 993.0], [50.6, 994.0], [50.7, 994.0], [50.8, 994.0], [50.9, 996.0], [51.0, 996.0], [51.1, 997.0], [51.2, 998.0], [51.3, 998.0], [51.4, 1000.0], [51.5, 1001.0], [51.6, 1004.0], [51.7, 1005.0], [51.8, 1006.0], [51.9, 1007.0], [52.0, 1007.0], [52.1, 1008.0], [52.2, 1008.0], [52.3, 1009.0], [52.4, 1011.0], [52.5, 1011.0], [52.6, 1011.0], [52.7, 1011.0], [52.8, 1013.0], [52.9, 1016.0], [53.0, 1019.0], [53.1, 1019.0], [53.2, 1020.0], [53.3, 1022.0], [53.4, 1023.0], [53.5, 1023.0], [53.6, 1024.0], [53.7, 1025.0], [53.8, 1025.0], [53.9, 1026.0], [54.0, 1026.0], [54.1, 1027.0], [54.2, 1029.0], [54.3, 1032.0], [54.4, 1032.0], [54.5, 1033.0], [54.6, 1033.0], [54.7, 1035.0], [54.8, 1035.0], [54.9, 1037.0], [55.0, 1039.0], [55.1, 1040.0], [55.2, 1040.0], [55.3, 1041.0], [55.4, 1041.0], [55.5, 1041.0], [55.6, 1041.0], [55.7, 1044.0], [55.8, 1044.0], [55.9, 1047.0], [56.0, 1048.0], [56.1, 1048.0], [56.2, 1049.0], [56.3, 1049.0], [56.4, 1049.0], [56.5, 1053.0], [56.6, 1054.0], [56.7, 1054.0], [56.8, 1056.0], [56.9, 1057.0], [57.0, 1057.0], [57.1, 1057.0], [57.2, 1058.0], [57.3, 1060.0], [57.4, 1062.0], [57.5, 1062.0], [57.6, 1063.0], [57.7, 1065.0], [57.8, 1067.0], [57.9, 1068.0], [58.0, 1068.0], [58.1, 1069.0], [58.2, 1070.0], [58.3, 1070.0], [58.4, 1070.0], [58.5, 1071.0], [58.6, 1072.0], [58.7, 1074.0], [58.8, 1075.0], [58.9, 1078.0], [59.0, 1079.0], [59.1, 1080.0], [59.2, 1083.0], [59.3, 1085.0], [59.4, 1087.0], [59.5, 1088.0], [59.6, 1088.0], [59.7, 1090.0], [59.8, 1094.0], [59.9, 1094.0], [60.0, 1095.0], [60.1, 1096.0], [60.2, 1100.0], [60.3, 1101.0], [60.4, 1102.0], [60.5, 1104.0], [60.6, 1104.0], [60.7, 1105.0], [60.8, 1105.0], [60.9, 1105.0], [61.0, 1107.0], [61.1, 1108.0], [61.2, 1110.0], [61.3, 1110.0], [61.4, 1112.0], [61.5, 1113.0], [61.6, 1113.0], [61.7, 1118.0], [61.8, 1118.0], [61.9, 1120.0], [62.0, 1120.0], [62.1, 1121.0], [62.2, 1121.0], [62.3, 1122.0], [62.4, 1122.0], [62.5, 1126.0], [62.6, 1129.0], [62.7, 1131.0], [62.8, 1131.0], [62.9, 1132.0], [63.0, 1133.0], [63.1, 1134.0], [63.2, 1135.0], [63.3, 1135.0], [63.4, 1136.0], [63.5, 1140.0], [63.6, 1142.0], [63.7, 1146.0], [63.8, 1146.0], [63.9, 1146.0], [64.0, 1147.0], [64.1, 1147.0], [64.2, 1147.0], [64.3, 1148.0], [64.4, 1148.0], [64.5, 1148.0], [64.6, 1149.0], [64.7, 1152.0], [64.8, 1153.0], [64.9, 1153.0], [65.0, 1157.0], [65.1, 1159.0], [65.2, 1159.0], [65.3, 1159.0], [65.4, 1159.0], [65.5, 1159.0], [65.6, 1161.0], [65.7, 1165.0], [65.8, 1166.0], [65.9, 1167.0], [66.0, 1168.0], [66.1, 1168.0], [66.2, 1172.0], [66.3, 1172.0], [66.4, 1173.0], [66.5, 1174.0], [66.6, 1174.0], [66.7, 1174.0], [66.8, 1175.0], [66.9, 1176.0], [67.0, 1179.0], [67.1, 1179.0], [67.2, 1180.0], [67.3, 1181.0], [67.4, 1183.0], [67.5, 1183.0], [67.6, 1185.0], [67.7, 1187.0], [67.8, 1187.0], [67.9, 1189.0], [68.0, 1190.0], [68.1, 1191.0], [68.2, 1191.0], [68.3, 1195.0], [68.4, 1196.0], [68.5, 1197.0], [68.6, 1197.0], [68.7, 1198.0], [68.8, 1198.0], [68.9, 1202.0], [69.0, 1204.0], [69.1, 1204.0], [69.2, 1205.0], [69.3, 1205.0], [69.4, 1205.0], [69.5, 1206.0], [69.6, 1206.0], [69.7, 1207.0], [69.8, 1208.0], [69.9, 1208.0], [70.0, 1210.0], [70.1, 1211.0], [70.2, 1212.0], [70.3, 1214.0], [70.4, 1214.0], [70.5, 1214.0], [70.6, 1214.0], [70.7, 1216.0], [70.8, 1219.0], [70.9, 1220.0], [71.0, 1220.0], [71.1, 1221.0], [71.2, 1224.0], [71.3, 1228.0], [71.4, 1233.0], [71.5, 1234.0], [71.6, 1234.0], [71.7, 1234.0], [71.8, 1236.0], [71.9, 1237.0], [72.0, 1238.0], [72.1, 1240.0], [72.2, 1240.0], [72.3, 1241.0], [72.4, 1241.0], [72.5, 1243.0], [72.6, 1244.0], [72.7, 1246.0], [72.8, 1249.0], [72.9, 1251.0], [73.0, 1253.0], [73.1, 1254.0], [73.2, 1255.0], [73.3, 1259.0], [73.4, 1259.0], [73.5, 1260.0], [73.6, 1260.0], [73.7, 1261.0], [73.8, 1264.0], [73.9, 1265.0], [74.0, 1267.0], [74.1, 1267.0], [74.2, 1268.0], [74.3, 1269.0], [74.4, 1270.0], [74.5, 1270.0], [74.6, 1271.0], [74.7, 1273.0], [74.8, 1273.0], [74.9, 1274.0], [75.0, 1274.0], [75.1, 1276.0], [75.2, 1277.0], [75.3, 1278.0], [75.4, 1280.0], [75.5, 1280.0], [75.6, 1282.0], [75.7, 1282.0], [75.8, 1283.0], [75.9, 1284.0], [76.0, 1286.0], [76.1, 1289.0], [76.2, 1290.0], [76.3, 1290.0], [76.4, 1291.0], [76.5, 1291.0], [76.6, 1292.0], [76.7, 1294.0], [76.8, 1295.0], [76.9, 1300.0], [77.0, 1300.0], [77.1, 1301.0], [77.2, 1302.0], [77.3, 1305.0], [77.4, 1305.0], [77.5, 1306.0], [77.6, 1307.0], [77.7, 1308.0], [77.8, 1312.0], [77.9, 1313.0], [78.0, 1315.0], [78.1, 1316.0], [78.2, 1316.0], [78.3, 1320.0], [78.4, 1321.0], [78.5, 1321.0], [78.6, 1325.0], [78.7, 1326.0], [78.8, 1326.0], [78.9, 1327.0], [79.0, 1328.0], [79.1, 1329.0], [79.2, 1331.0], [79.3, 1331.0], [79.4, 1331.0], [79.5, 1333.0], [79.6, 1334.0], [79.7, 1334.0], [79.8, 1335.0], [79.9, 1335.0], [80.0, 1338.0], [80.1, 1339.0], [80.2, 1341.0], [80.3, 1342.0], [80.4, 1344.0], [80.5, 1346.0], [80.6, 1347.0], [80.7, 1347.0], [80.8, 1347.0], [80.9, 1348.0], [81.0, 1351.0], [81.1, 1352.0], [81.2, 1358.0], [81.3, 1359.0], [81.4, 1359.0], [81.5, 1361.0], [81.6, 1364.0], [81.7, 1368.0], [81.8, 1373.0], [81.9, 1374.0], [82.0, 1376.0], [82.1, 1377.0], [82.2, 1380.0], [82.3, 1382.0], [82.4, 1389.0], [82.5, 1391.0], [82.6, 1394.0], [82.7, 1398.0], [82.8, 1401.0], [82.9, 1402.0], [83.0, 1412.0], [83.1, 1412.0], [83.2, 1413.0], [83.3, 1413.0], [83.4, 1415.0], [83.5, 1416.0], [83.6, 1417.0], [83.7, 1418.0], [83.8, 1420.0], [83.9, 1424.0], [84.0, 1428.0], [84.1, 1429.0], [84.2, 1431.0], [84.3, 1433.0], [84.4, 1437.0], [84.5, 1440.0], [84.6, 1441.0], [84.7, 1445.0], [84.8, 1445.0], [84.9, 1447.0], [85.0, 1448.0], [85.1, 1450.0], [85.2, 1451.0], [85.3, 1452.0], [85.4, 1455.0], [85.5, 1458.0], [85.6, 1460.0], [85.7, 1460.0], [85.8, 1461.0], [85.9, 1462.0], [86.0, 1465.0], [86.1, 1465.0], [86.2, 1465.0], [86.3, 1469.0], [86.4, 1470.0], [86.5, 1471.0], [86.6, 1478.0], [86.7, 1481.0], [86.8, 1489.0], [86.9, 1492.0], [87.0, 1499.0], [87.1, 1501.0], [87.2, 1502.0], [87.3, 1502.0], [87.4, 1502.0], [87.5, 1503.0], [87.6, 1506.0], [87.7, 1509.0], [87.8, 1509.0], [87.9, 1512.0], [88.0, 1513.0], [88.1, 1514.0], [88.2, 1515.0], [88.3, 1516.0], [88.4, 1528.0], [88.5, 1531.0], [88.6, 1531.0], [88.7, 1531.0], [88.8, 1534.0], [88.9, 1536.0], [89.0, 1536.0], [89.1, 1537.0], [89.2, 1539.0], [89.3, 1540.0], [89.4, 1541.0], [89.5, 1545.0], [89.6, 1550.0], [89.7, 1553.0], [89.8, 1555.0], [89.9, 1557.0], [90.0, 1559.0], [90.1, 1560.0], [90.2, 1566.0], [90.3, 1566.0], [90.4, 1567.0], [90.5, 1569.0], [90.6, 1574.0], [90.7, 1574.0], [90.8, 1576.0], [90.9, 1582.0], [91.0, 1588.0], [91.1, 1596.0], [91.2, 1602.0], [91.3, 1613.0], [91.4, 1616.0], [91.5, 1617.0], [91.6, 1626.0], [91.7, 1637.0], [91.8, 1650.0], [91.9, 1661.0], [92.0, 1664.0], [92.1, 1676.0], [92.2, 1679.0], [92.3, 1682.0], [92.4, 1687.0], [92.5, 1692.0], [92.6, 1703.0], [92.7, 1704.0], [92.8, 1705.0], [92.9, 1715.0], [93.0, 1722.0], [93.1, 1723.0], [93.2, 1726.0], [93.3, 1745.0], [93.4, 1757.0], [93.5, 1759.0], [93.6, 1761.0], [93.7, 1763.0], [93.8, 1774.0], [93.9, 1792.0], [94.0, 1803.0], [94.1, 1842.0], [94.2, 1849.0], [94.3, 1869.0], [94.4, 1879.0], [94.5, 1885.0], [94.6, 1899.0], [94.7, 1909.0], [94.8, 1911.0], [94.9, 1915.0], [95.0, 1931.0], [95.1, 1948.0], [95.2, 1971.0], [95.3, 1976.0], [95.4, 1982.0], [95.5, 1982.0], [95.6, 1985.0], [95.7, 1989.0], [95.8, 1993.0], [95.9, 2010.0], [96.0, 2017.0], [96.1, 2017.0], [96.2, 2022.0], [96.3, 2028.0], [96.4, 2042.0], [96.5, 2044.0], [96.6, 2046.0], [96.7, 2049.0], [96.8, 2053.0], [96.9, 2055.0], [97.0, 2056.0], [97.1, 2056.0], [97.2, 2068.0], [97.3, 2077.0], [97.4, 2090.0], [97.5, 2096.0], [97.6, 2113.0], [97.7, 2116.0], [97.8, 2128.0], [97.9, 2132.0], [98.0, 2149.0], [98.1, 2149.0], [98.2, 2168.0], [98.3, 2174.0], [98.4, 2194.0], [98.5, 2200.0], [98.6, 2212.0], [98.7, 2215.0], [98.8, 2254.0], [98.9, 2265.0], [99.0, 2271.0], [99.1, 2271.0], [99.2, 2275.0], [99.3, 2295.0], [99.4, 2313.0], [99.5, 2318.0], [99.6, 2380.0], [99.7, 2415.0], [99.8, 2478.0], [99.9, 2587.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 108.0, "series": [{"data": [[0.0, 61.0], [600.0, 67.0], [700.0, 70.0], [800.0, 81.0], [900.0, 108.0], [1000.0, 88.0], [1100.0, 87.0], [1200.0, 80.0], [1300.0, 60.0], [1400.0, 43.0], [1500.0, 41.0], [100.0, 42.0], [1600.0, 14.0], [1700.0, 14.0], [1800.0, 7.0], [1900.0, 12.0], [2000.0, 17.0], [2100.0, 9.0], [2200.0, 9.0], [2300.0, 3.0], [2400.0, 2.0], [2500.0, 1.0], [200.0, 12.0], [300.0, 5.0], [400.0, 20.0], [500.0, 47.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 2500.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 129.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 731.0, "series": [{"data": [[1.0, 731.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[0.0, 140.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 129.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 2.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 88.43899999999992, "minX": 1.5496185E12, "maxY": 88.43899999999992, "series": [{"data": [[1.5496185E12, 88.43899999999992]], "isOverall": false, "label": "Grupo de Hilos", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496185E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 116.5, "minX": 1.0, "maxY": 2113.0, "series": [{"data": [[2.0, 1191.0], [3.0, 914.0], [4.0, 873.0], [5.0, 312.0], [6.0, 292.8888888888889], [7.0, 247.85714285714286], [8.0, 116.5], [9.0, 118.7777777777778], [10.0, 269.16666666666663], [11.0, 306.5], [12.0, 447.0], [13.0, 209.20000000000002], [14.0, 283.33333333333337], [15.0, 446.0], [16.0, 301.2], [17.0, 818.6666666666666], [18.0, 399.2], [19.0, 424.0], [20.0, 837.0], [21.0, 727.0], [22.0, 474.0], [23.0, 564.0], [24.0, 474.66666666666663], [25.0, 602.5], [26.0, 369.33333333333337], [27.0, 1065.0], [28.0, 963.0], [30.0, 1610.5], [33.0, 1391.0], [32.0, 901.0], [35.0, 1499.0], [34.0, 1152.0], [37.0, 950.0], [36.0, 2113.0], [39.0, 1122.0], [38.0, 1452.0], [41.0, 1159.0], [40.0, 766.0], [43.0, 2010.0], [42.0, 1044.0], [45.0, 2077.0], [44.0, 2049.0], [47.0, 833.0], [46.0, 855.0], [49.0, 726.0], [48.0, 1072.0], [51.0, 672.75], [50.0, 886.0], [53.0, 643.8888888888889], [52.0, 729.0], [55.0, 699.1666666666666], [54.0, 696.8], [57.0, 599.8], [56.0, 688.0], [59.0, 671.0], [58.0, 601.5384615384614], [61.0, 733.2], [60.0, 780.5], [63.0, 724.0], [62.0, 683.8], [67.0, 713.0], [66.0, 840.4], [65.0, 857.2857142857143], [64.0, 760.6666666666666], [71.0, 1002.75], [70.0, 704.3000000000001], [69.0, 763.0833333333334], [68.0, 894.0], [75.0, 797.3636363636364], [74.0, 817.3125], [73.0, 807.6666666666666], [72.0, 773.875], [79.0, 849.5], [78.0, 1018.5], [77.0, 1041.6666666666667], [76.0, 983.2], [83.0, 960.0], [82.0, 894.9999999999999], [81.0, 977.3333333333334], [80.0, 797.0], [87.0, 907.0555555555555], [86.0, 857.0], [85.0, 882.6363636363636], [84.0, 1056.875], [88.0, 896.375], [91.0, 991.5], [90.0, 986.4285714285714], [89.0, 984.7777777777778], [95.0, 1006.1250000000001], [94.0, 1030.8125], [93.0, 1030.142857142857], [92.0, 1035.2500000000002], [97.0, 1050.8999999999999], [96.0, 1005.6], [99.0, 1372.3333333333333], [98.0, 1075.1428571428573], [103.0, 1527.6666666666667], [102.0, 1184.0], [101.0, 1209.0], [100.0, 1256.0], [107.0, 1083.5714285714284], [106.0, 1108.0], [105.0, 1196.0], [104.0, 1098.5], [110.0, 1228.1000000000001], [111.0, 1353.3333333333335], [109.0, 1118.0322580645163], [108.0, 1166.0500000000002], [115.0, 1302.0], [114.0, 1431.75], [113.0, 1310.875], [112.0, 1253.2500000000002], [116.0, 1098.75], [119.0, 1216.4285714285713], [118.0, 1301.75], [117.0, 1440.5], [123.0, 1266.857142857143], [122.0, 1573.25], [121.0, 1527.0], [120.0, 1283.4285714285713], [127.0, 1320.5555555555554], [126.0, 1570.3000000000002], [125.0, 1196.8749999999998], [124.0, 1252.888888888889], [135.0, 1110.875], [134.0, 1262.0], [132.0, 1310.4642857142858], [133.0, 1266.4444444444443], [131.0, 1388.7647058823532], [130.0, 1347.5333333333335], [128.0, 1196.1764705882354], [129.0, 1548.9], [136.0, 1277.0], [139.0, 1601.0], [140.0, 1311.5], [138.0, 1583.0], [142.0, 1528.5], [143.0, 1396.6666666666667], [141.0, 991.0], [137.0, 1569.0], [150.0, 1371.5], [151.0, 1110.0], [149.0, 1759.0], [148.0, 2017.0], [147.0, 1909.0], [146.0, 2090.0], [145.0, 1985.0], [144.0, 1971.0], [153.0, 1342.5], [152.0, 1469.0], [156.0, 1519.2], [155.0, 1428.5], [159.0, 1744.5], [158.0, 1605.0], [157.0, 1453.2], [154.0, 1531.0], [160.0, 1480.125], [161.0, 1483.0], [162.0, 1552.6666666666667], [165.0, 1323.857142857143], [164.0, 1591.6666666666667], [163.0, 1610.6666666666667], [166.0, 1273.0], [1.0, 940.0]], "isOverall": false, "label": "Petición HTTP", "isController": false}, {"data": [[88.43899999999992, 988.6689999999991]], "isOverall": false, "label": "Petición HTTP-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 166.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 6283.333333333333, "minX": 1.5496185E12, "maxY": 6999.583333333333, "series": [{"data": [[1.5496185E12, 6999.583333333333]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5496185E12, 6283.333333333333]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496185E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 988.6689999999991, "minX": 1.5496185E12, "maxY": 988.6689999999991, "series": [{"data": [[1.5496185E12, 988.6689999999991]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496185E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 988.6549999999996, "minX": 1.5496185E12, "maxY": 988.6549999999996, "series": [{"data": [[1.5496185E12, 988.6549999999996]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496185E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 39.08300000000004, "minX": 1.5496185E12, "maxY": 39.08300000000004, "series": [{"data": [[1.5496185E12, 39.08300000000004]], "isOverall": false, "label": "Petición HTTP", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496185E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 69.0, "minX": 1.5496185E12, "maxY": 2587.0, "series": [{"data": [[1.5496185E12, 2587.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5496185E12, 69.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5496185E12, 1558.8]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5496185E12, 2270.94]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5496185E12, 1930.199999999999]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496185E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 989.0, "minX": 16.0, "maxY": 989.0, "series": [{"data": [[16.0, 989.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 989.0, "minX": 16.0, "maxY": 989.0, "series": [{"data": [[16.0, 989.0]], "isOverall": false, "label": "Successes", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 16.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 16.666666666666668, "minX": 1.5496185E12, "maxY": 16.666666666666668, "series": [{"data": [[1.5496185E12, 16.666666666666668]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496185E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 16.666666666666668, "minX": 1.5496185E12, "maxY": 16.666666666666668, "series": [{"data": [[1.5496185E12, 16.666666666666668]], "isOverall": false, "label": "200", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5496185E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 16.666666666666668, "minX": 1.5496185E12, "maxY": 16.666666666666668, "series": [{"data": [[1.5496185E12, 16.666666666666668]], "isOverall": false, "label": "Petición HTTP-success", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5496185E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 0);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
